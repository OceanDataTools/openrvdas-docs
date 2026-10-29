---
permalink: /local_code/
title: "Your Institution's Code and Configuration: the local/ Directory"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
Every ship running OpenRVDAS has files of its own: cruise definitions, device definitions for its
instruments, calibration files, logger templates, perhaps a transform or two written for an unusual
sensor. This page describes where those files should live, using a fictional institution, the University
of Upper Windsock (`uuw`), and its vessel, the M/V Plunger (`mvp`).

**In short:** institution-specific files should be kept in a git repository of your own, checked out alongside OpenRVDAS (e.g. at
`/opt/openrvdas_uuw`), and should be symlinked into OpenRVDAS's `local/` directory:

```
ln -s /opt/openrvdas_uuw /opt/openrvdas/local/uuw
```

Everything in your repository can then be referred to from within the OpenRVDAS installation directory as `local/uuw/...`, as though it were part of
OpenRVDAS, while remaining entirely separate from it.

# Why a separate repository

* **Your history is your own.** Changes to your cruise definitions and calibrations are committed,
  reviewed and tagged in your repository, on your schedule, without becoming changes to OpenRVDAS.
* **Upgrading OpenRVDAS doesn't touch your files.** Checking out a new OpenRVDAS release changes
  only OpenRVDAS's own files. The link in `local/` isn't part of the OpenRVDAS repository, so it,
  and everything it points to, is left alone.
* **One repository can serve a fleet.** Shared device definitions and templates live at the top
  of the repository, with a directory for each vessel. Each ship checks out the same repository.
* **Your configuration can be recorded exactly.** A [config snapshot]({{ "/cruise_records/" | relative_url }})
  records the commit of every repository its files came from, so a snapshot names the exact version
  of your configuration, separately from the version of OpenRVDAS.

Earlier versions of OpenRVDAS kept some institutions' files directly in `local/` within the
OpenRVDAS repository. Those have since moved to separate repositories under
[OceanDataTools](https://github.com/OceanDataTools), and new installations should use the approach
described here.

# Setting it up

Check out your repository next to OpenRVDAS, and link it into `local/`:

```
cd /opt
git clone https://github.com/uuw/openrvdas_uuw.git      # your institution's repository
ln -s /opt/openrvdas_uuw /opt/openrvdas/local/uuw
```

Check that the link points where you expect:

```
ls -l /opt/openrvdas/local/uuw
lrwxr-xr-x  1 rvdas  rvdas  18 Oct 23 14:02 /opt/openrvdas/local/uuw -> /opt/openrvdas_uuw
```

A few details:

* **Make sure `local/uuw` doesn't already exist.** If it is already a directory, `ln -s` creates
  the link *inside* it, as `local/uuw/openrvdas_uuw`, and nothing else on this page will find your
  files.
* **The OpenRVDAS user needs to be able to read the repository.** The logger manager and loggers
  run as that user (`rvdas` by default), so give it ownership of the checkout, or at least read
  access.
* **Keep OpenRVDAS's `git status` clean** by telling git to ignore the link. Add it to the
  OpenRVDAS checkout's private exclude file, which isn't part of the repository:

  ```
  echo local/uuw >> /opt/openrvdas/.git/info/exclude
  ```

  Otherwise `git status` in `/opt/openrvdas` shows `?? local/uuw`. That's harmless, but it's
  noise, and it hides real untracked files. (The link doesn't affect the code version OpenRVDAS
  records for itself in its journal and snapshots.)

# What goes in it

A layout that works well, extending the one suggested in OpenRVDAS's
[`local/README.md`](https://github.com/OceanDataTools/openrvdas/blob/master/local/README.md):

```
/opt/openrvdas_uuw/                    linked as /opt/openrvdas/local/uuw
  README.md
  devices/                             device and device type definitions shared across vessels
  logger_templates/                    logger templates of your own
  modules/                             readers, transforms and writers of your own
  mvp/                                 the M/V Plunger
    devices/                           devices specific to this vessel
    calibrations-2026-10-01.yaml       calibration coefficients, one dated file per set
    calibrations.yaml -> calibrations-2026-10-01.yaml
    sealog_events.yaml                 other per-vessel configuration
    MVP2610_cruise.yaml                a cruise definition
    MVP2611/                           (optional) files for one cruise only
      MVP2611_cruise.yaml
  lmg/                                 another vessel
    ...
```

The calibration files are described in
[Calibrated Values for Sensor Data]({{ "/cookbook/calibrated_values/" | relative_url }}).

# Referring to your files

OpenRVDAS's loggers run with the OpenRVDAS directory as their working directory, and paths in
cruise definitions are relative to it. Refer to your files through the link, as `local/uuw/...`,
not as `/opt/openrvdas_uuw/...`. That keeps cruise definitions independent of where the repository
happens to be checked out.

**Included files**, such as templates and calibration files:

```
includes:
  - contrib/logger_templates/serial_logger_template.yaml
  - local/uuw/logger_templates/*.yaml
  - local/uuw/mvp/calibrations.yaml
```

**Device definitions**, for a `ParseTransform`. Name OpenRVDAS's own definitions as well as yours,
since giving a `definition_path` replaces the default:

```
- class: ParseTransform
  kwargs:
    definition_path: contrib/devices/*.yaml,local/uuw/devices/*.yaml,local/uuw/mvp/devices/*.yaml
```

**Your own components**, by their Python module path, which follows the directory path with dots in
place of slashes. No `__init__.py` files are needed:

```
- class: ScaleTransform
  module: local.uuw.modules.scale_transform     # /opt/openrvdas_uuw/modules/scale_transform.py
  kwargs:
    factor: 3
```

`validate_config` warns `Unknown transform class: 'ScaleTransform'` about your own components,
because it knows only OpenRVDAS's built-in ones. That warning is expected. Its other checks still
apply.

**Loading a cruise definition** in the web console, or on the command line with `lmcmd`
(which works with the Django console's database), also works through the link:

```
lmcmd load_configuration local/uuw/mvp/MVP2610_cruise.yaml
```

# Things to keep out of the repository

Don't commit passwords and tokens, such as an InfluxDB token or a Sealog JWT, to your repository,
especially if it is shared beyond the ship. Put them in a file that git ignores, and include it
from the cruise definition like any other file:

```
# /opt/openrvdas_uuw/.gitignore
mvp/secrets.yaml
```

```
# local/uuw/mvp/secrets.yaml - not committed
variables:
  influxdb_auth_token: ...
  sealog_token: ...
```

Config snapshots still copy such files, and [warn you]({{ "/cruise_records/#secrets" | relative_url }})
that they contain secrets.

# Upgrading and archiving

**When upgrading OpenRVDAS**, nothing in your repository changes, but things it relies on might:
the names or options of components, or the variables a template expects. After checking out a new
release, run `validate_config` over your cruise definitions before loading them.

**At the end of a cruise**, tag your repository, so the configuration can be checked out later
exactly as it was:

```
cd /opt/openrvdas_uuw
git status             # commit anything uncommitted first
git tag MVP2610-end
git push --tags
```

Snapshots taken during the cruise record your repository's commit (under `repositories:` in
`MANIFEST.yaml`), and each captured file's real location in it (as `resolves_to`). See
[Recording What Ran]({{ "/cruise_records/" | relative_url }}).
