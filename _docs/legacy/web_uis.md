---
permalink: /web_uis/
title: "Web Consoles: Installing and Switching Between Django and React"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
OpenRVDAS offers two web consoles for loading cruise definitions, changing modes, and watching
loggers. You can also run with no web console at all:

| Console | Built with | Status |
|---|---|---|
| `django` | Django, served by nginx + uwsgi | The classic console. Stable and full-featured; the default. |
| `react` | React front end, FastAPI back end, served by nginx + uvicorn | Newer, and still marked experimental by the installer. |
| `none` | | No web console. Loggers are controlled from the command line (e.g. with `lmcmd`). |

Only one console runs at a time. This page covers installing each, and switching between them on an
installed system with `utils/switch_ui.sh`.

> **Version note:** `switch_ui.sh`, and the installer writing configuration for both consoles, are
> new in OpenRVDAS v2.7.0. From v2.7.0, both consoles also display the OpenRVDAS version.

# How the pieces fit together

Both consoles talk to the same logger manager, but keep their state (the loaded cruise definition,
the active mode, users) in **different databases**:

* the Django console uses the Django database, and the logger manager runs with `--database django`;
* the React console uses the FastAPI back end's database (`web_backend/db.sqlite3`), and the logger
  manager runs with `--database fastapi`.

The logger manager runs under supervisor. The installer writes supervisor entries for *both*
consoles, with the one you didn't choose commented out:

| Supervisor file | Programs | Group |
|---|---|---|
| `openrvdas_django.conf` | nginx + uwsgi | `django` |
| `openrvdas_react.conf` | nginx + uvicorn | `react_ui` |
| `openrvdas_logger_manager.conf` | logger_manager, with `--database django` or `--database fastapi` | |

Both console entries define a program called `nginx`, which is why only one can be active. (On
CentOS/RHEL/Rocky and macOS the files end in `.ini` rather than `.conf`. Their locations are
listed [below](#non-standard-installations).)

Switching consoles means commenting one entry out and the other in, pointing the logger manager at
the matching database, and restarting. `switch_ui.sh` does all of that.

# Installing

## Choosing a console at install time

The installer, `utils/install_openrvdas.sh`, asks which console to install:

```
#####################################################################
OpenRVDAS includes two web-based console options:
  django - Classic Django UI (stable, full-featured)
  react  - New React/FastAPI UI (experimental)
  none   - No web UI (headless / portability mode)

Which web UI would you like to install? (django/react/none) [django]
```

See the [Installation Guide]({{ "/install/" | relative_url }}) for the rest of the installer's
questions. Your answer is saved as `DEFAULT_UI_TYPE` in the installer's preferences file,
`.install_openrvdas_preferences`, and offered as the default next time.

## What the React console needs

The React console has requirements the Django console doesn't:

* **Python 3.11 or newer** for its FastAPI back end. The installer checks, and refuses to install
  the React console with an older `python3`. On systems whose default Python is older, install a
  newer one alongside it and tell the installer to use it with `BACKEND_PYTHON`:

  ```
  # Ubuntu
  sudo add-apt-repository ppa:deadsnakes/ppa
  sudo apt install python3.11 python3.11-venv python3.11-dev
  BACKEND_PYTHON=python3.11 bash utils/install_openrvdas.sh

  # RHEL/Rocky/Alma
  sudo dnf install python3.11 python3.11-devel
  BACKEND_PYTHON=python3.11 bash utils/install_openrvdas.sh
  ```

* **Node.js 22.13.0 or newer** to build the front end. The installer installs or upgrades Node.js
  itself (from NodeSource on Linux, Homebrew on macOS). If an older `node` stays first on your
  `PATH` after that, the installer stops and says so. Remove or reorder the old one and run it again.

* **The `web_backend` and `web_frontend` git submodules**, which hold the React console's code. The
  installer fetches them when it clones or updates OpenRVDAS. If you update an existing installation
  by hand, fetch them yourself:

  ```
  cd /opt/openrvdas
  git submodule update --init
  ```

When you choose `react`, the installer also asks:

* whether to expose the FastAPI back end's API documentation pages (`/docs` and `/redoc`) through
  nginx. They are useful for development, but they publish your API's structure with no
  authentication, so the default is no;
* for an initial admin username and password for the React console, unless its database already
  exists. After that, manage accounts from the console itself.

## Installing both, so you can switch

`switch_ui.sh` switches only between consoles that have already been installed. It doesn't build
anything. To be able to switch freely, install each console once:

1. Run the installer and choose one console, say `django`.
2. Run the installer again and choose the other, `react`. This builds the React front end and back
   end, and leaves the Django console's files in place.

From v2.7.0, the installer writes nginx configuration for both consoles on every run (the React one
only if `web_frontend` is present), so the second run is all that's needed. After that, use
`switch_ui.sh`.

# Switching consoles with switch_ui.sh

## Usage

```
cd /opt/openrvdas
bash utils/switch_ui.sh status         # which console is configured, and supervisor's status
bash utils/switch_ui.sh react          # switch to the React console
bash utils/switch_ui.sh django         # switch to the Django console
bash utils/switch_ui.sh none           # turn the web console off
```

| Option | Meaning |
|---|---|
| `-y`, `--yes` | Don't ask for confirmation. |
| `-n`, `--dry-run` | Show what would change, but don't change anything. |
| `--no-restart` | Rewrite the configuration, but don't stop or start anything. |
| `-h`, `--help` | Show usage. |

The script needs sudo to rewrite supervisor's files, and asks for your password if necessary.

## What it does

Before changing anything, the script prints the installation it found, the console currently
configured and the logger manager's database, and then a list of what it will do. For example,
switching from Django to React:

```
Switching web UI: django -> react

This will:
  - enable  nginx + uvicorn in /etc/supervisor/conf.d/openrvdas_react.conf
  - disable nginx + uwsgi   in /etc/supervisor/conf.d/openrvdas_django.conf
  - set logger_manager to --database fastapi
  - set DEFAULT_UI_TYPE=react in /opt/openrvdas/.install_openrvdas_preferences
  - restart the affected supervisor processes
```

When you confirm, it:

1. comments out the old console's supervisor entry and uncomments the new one;
2. changes the logger manager's `--database` argument to match. It changes nothing else on that
   line, so options you've added by hand, such as
   [`--snapshot_dir`]({{ "/cruise_records/#turning-on-automatic-snapshots" | relative_url }}), are
   kept;
3. updates `DEFAULT_UI_TYPE` in the installer's preferences file, so a later run of the installer
   doesn't quietly switch you back;
4. stops the old console, has supervisor reread its configuration, restarts the logger manager, and
   starts the new console.

`none` disables both consoles and leaves the logger manager on the Django database, as a headless
installation does.

Switching to the console that is already configured does nothing, so the script is safe to run
twice.

## After switching: load your cruise definition again

**The two consoles don't share a database.** A cruise definition loaded under the Django console
isn't there under the React console, and vice versa. After switching, the logger manager starts
with whatever the newly selected database last held, which may be nothing or an old definition.
Load your cruise definition through the new console and set the mode you want.

The script reminds you of this before switching. Nothing is deleted: the other database is left
untouched, and is there again if you switch back.

Plan for loggers to stop briefly while the logger manager restarts and the new definition is loaded.
If you're [journaling]({{ "/cruise_records/#the-state-journal" | relative_url }}) (the default from
v2.7.0), the journal records the restart, the definition load and the mode change.

# Troubleshooting

**"the 'react' UI does not look fully installed".** The script lists the missing files. It switches
only to a console that has been built: for React, that means its supervisor entry,
`web_frontend/openrvdas_nginx.conf`, `web_frontend/dist/index.html`,
`web_backend/.venv/bin/uvicorn` and `web_backend/.env`; for Django, its supervisor entry,
`django_gui/openrvdas_nginx.conf`, `django_gui/openrvdas_uwsgi.ini` and `venv/bin/uwsgi`. Run the
installer and choose that console to build them.

**"venv is missing the packages logger_manager needs to talk to the FastAPI database".** The
logger manager runs from OpenRVDAS's main virtual environment, `venv/`, not the React back end's.
With `--database fastapi`, it needs FastAPI's packages in the main environment too. The installer
puts them there only when installing the React console. If `venv/` has been recreated since, for
example by an installer run choosing Django after the system's Python changed, they're gone.
Switching anyway would leave the logger manager dying with
`No module named 'fastapi'`, so the script refuses, and tells you to run:

```
/opt/openrvdas/venv/bin/pip install \
    'fastapi>=0.135.0' 'sqlalchemy>=2.0' 'aiosqlite>=0.22' \
    'greenlet>=3.2' 'pydantic>=2.0' 'pydantic-settings>=2.0'
```

then run the script again.

**"both the Django and React supervisor entries are enabled".** Someone has edited the files by
hand. Supervisor can't run both, because each defines `nginx`. Switching to either console repairs
it.

**The console loads, but shows no data, and the browser reports "Unexpected response code: 502"
from `/cds-ws`.** Something is trying to reach the CachedDataServer on the wrong port. From v2.7.0,
the installer asks which port the CachedDataServer should use (default 8766). That port is written
into several files: the CachedDataServer's and logger manager's supervisor entries, both consoles'
nginx configurations, and the React back end's `.env`. If they drift apart, every process shows as
RUNNING, and the only symptom is a console without data. `switch_ui.sh` checks these every time it
runs, including with `status`, and lists any that disagree. Fix each listed file to use the
CachedDataServer's port (in an nginx configuration, it's the `proxy_pass` line under
`location /cds-ws`) and restart the affected processes. Alternatively, run the installer again,
which writes them all consistently.

**The console doesn't come up at all.** Check:

```
sudo supervisorctl status
tail /var/log/openrvdas/nginx.stderr
tail /var/log/openrvdas/uvicorn.stderr     # React
tail /var/log/openrvdas/uwsgi.stderr       # Django
```

## Non-standard installations

The script finds supervisor's files in the standard places:

| System | Directory | Suffix |
|---|---|---|
| Ubuntu/Debian | `/etc/supervisor/conf.d` | `.conf` |
| CentOS/RHEL/Rocky/Alma | `/etc/supervisord.d` | `.ini` |
| macOS (Homebrew) | `/opt/homebrew/etc/supervisor.d` (`/usr/local/etc/supervisor.d` on Intel) | `.ini` |

It works out where OpenRVDAS is installed from the logger manager's supervisor entry. If your
installation is laid out differently, set `SUPERVISOR_DIR`, `SUPERVISOR_SUFFIX` and/or
`OPENRVDAS_ROOT` in the environment when running it:

```
SUPERVISOR_DIR=/usr/local/etc/supervisor.d OPENRVDAS_ROOT=/home/rvdas/openrvdas \
    bash utils/switch_ui.sh status
```
