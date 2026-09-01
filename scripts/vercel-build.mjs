import { spawnSync } from 'node:child_process'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Vercel caches dependencies, so always regenerate the client for the schema
// checked into this deployment.
run(npx, ['--no-install', 'prisma', 'generate'])

// Preview deployments must never migrate the production database. Configure
// a separate Preview DATABASE_URL before opting them into migrations.
if (process.env.VERCEL_ENV === 'production') {
  run(npx, ['--no-install', 'prisma', 'migrate', 'deploy'], {
    ...process.env,
    // Serverless traffic should use a pooled URL, while schema changes are
    // more reliable over a direct database connection when one is supplied.
    DATABASE_URL: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  })
} else {
  console.log(`Skipping database migrations for VERCEL_ENV=${process.env.VERCEL_ENV ?? 'local'}`)
}

run(npx, ['--no-install', 'next', 'build'])
