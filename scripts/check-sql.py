"""Validate migrations and RLS checks in an isolated local PostgreSQL cluster.
Requires initdb, pg_ctl and psql; never connects to the user's Supabase project.
"""
import os, pathlib, shutil, subprocess, tempfile
root=pathlib.Path(__file__).resolve().parent.parent
work=pathlib.Path(tempfile.mkdtemp(prefix='nest-sql-',dir='/tmp'))
data=work/'data'
started=False

def run(args,**kw):
    return subprocess.run(args,check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,**kw).stdout
try:
    run(['initdb','-D',str(data),'-A','trust','--no-locale','-E','UTF8'])
    run(['pg_ctl','-D',str(data),'-l',str(work/'postgres.log'),'-o',f"-k {work} -p 55439 -c listen_addresses=''",'-w','start'])
    started=True
    psql=['psql','-h',str(work),'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1']
    bootstrap='''
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema public,auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
create publication supabase_realtime;
'''
    run(psql,input=bootstrap)
    for path in sorted((root/'supabase/migrations').glob('*.sql')):
        try:
            if path.name == '005_baby_creation_access.sql':
                before=subprocess.run(psql+['-f',str(root/'supabase/tests/baby_creation_checks.sql')],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
                if before.returncode == 0 or 'new row violates row-level security policy' not in before.stdout:
                    raise RuntimeError('Expected original INSERT RETURNING RLS failure: '+before.stdout)
                print('PASS reproduced original INSERT RETURNING RLS failure before repair.',flush=True)
                # Reproduce a deployment without a default authenticated INSERT grant.
                run(psql,input='REVOKE INSERT ON public.babies FROM authenticated;')
            run(psql+['-f',str(path)])
            print('PASS migration:',path.name,flush=True)
        except subprocess.CalledProcessError as e:
            print(e.stdout,flush=True);raise
    for attempt in range(2):
        run(psql+['-f',str(root/'supabase/migrations/005_baby_creation_access.sql')])
        for check in ['baby_creation_checks.sql','caregiver_privacy_checks.sql']:
            result=run(psql+['-f',str(root/'supabase/tests'/check)])
            for line in result.splitlines():
                if 'PASS:' in line: print(f'Run {attempt+1}: '+line.strip(),flush=True)
    print('PASS local PostgreSQL validation; cluster is temporary.',flush=True)
except subprocess.CalledProcessError as e:
    print(e.stdout,flush=True)
    raise SystemExit(e.returncode)
finally:
    if started: subprocess.run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    shutil.rmtree(work)
