# Deployment

Pushing to `main` runs `.github/workflows/ci.yml`: test, build, rsync to Cloudways, migrate,
cache, then a health check against https://plan.dustindellinger.com/health. The deploy job is
skipped until the repository variable `DEPLOY_ENABLED` is `true`.

## One-time Cloudways setup

1. **Create the application.** Choose the **Custom PHP** application type (listed as "PHP
   Stack" or "Custom App" in some versions of the panel) and name it `planner`. The Laravel type
   also works, but it installs its own copy of Laravel, which the deploy then replaces.
2. **PHP version.** Server > Settings & Packages > Packages: PHP 8.3 or newer. This setting is
   server-wide, so check that the other applications on the server run on it.
3. **Domain and SSL.** Application > Domain Management: add `plan.dustindellinger.com` as the
   primary domain and point its DNS A record at the server. Then SSL Certificate > Let's Encrypt.
   Turn on HTTPS redirection.
4. **Webroot.** Application > Application Settings > General > Webroot: `public_html/public`.
5. **`public_html` contents.** Nothing to do. The first deploy replaces whatever Cloudways put
   there (rsync runs with `--delete`), except `.env` and `storage/`.
6. **SSH access.** Application > Access Details > Application Credentials: create an SSH user
   for this application and enable SSH access for it in Application Settings. Add the public
   half of a new key pair (`ssh-keygen -t ed25519 -f planner_deploy`) under SSH Keys. Deploying
   as the application user keeps file ownership correct; deploying as the master user means
   running "Reset Permissions" after every deploy.
7. **`.env` on the server**, in `public_html/.env`:

    ```ini
    APP_NAME="My Planner"
    APP_ENV=production
    APP_KEY=            # php artisan key:generate --show
    APP_DEBUG=false
    APP_URL=https://plan.dustindellinger.com

    DB_CONNECTION=mysql
    DB_HOST=127.0.0.1
    DB_PORT=3306
    DB_DATABASE=        # Application > Access Details > MySQL Access
    DB_USERNAME=
    DB_PASSWORD=

    SESSION_DRIVER=database
    SESSION_SECURE_COOKIE=true
    CACHE_STORE=database
    QUEUE_CONNECTION=database
    ```

8. **Cron.** Application > Cron Job Management > Advanced:

    ```
    * * * * * cd /home/master/applications/<app folder>/public_html && php artisan schedule:run >> /dev/null 2>&1
    ```

## GitHub settings

Repository > Settings > Secrets and variables > Actions.

| Kind     | Name                 | Value                                                                    |
| -------- | -------------------- | ------------------------------------------------------------------------ |
| Secret   | `CLOUDWAYS_SSH_HOST` | The server's public IP                                                   |
| Secret   | `CLOUDWAYS_SSH_USER` | The application SSH user from step 6                                     |
| Secret   | `CLOUDWAYS_SSH_KEY`  | The private half of the deploy key                                       |
| Secret   | `CLOUDWAYS_APP_PATH` | Absolute path to `public_html` (run `pwd` there over SSH), no trailing slash |
| Variable | `DEPLOY_ENABLED`     | `true`                                                                   |

The deploy job uses a GitHub environment named `production`; GitHub creates it on first run.

## What a deploy leaves alone

`.env`, `storage/` and the `public/storage` symlink are excluded from the sync, so sessions,
logs and uploads survive each deploy.
