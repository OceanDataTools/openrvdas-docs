---
permalink: /cruise_records/
title: "Recording What Ran: Snapshots, the State Journal and Cruise Archives"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
Data is only as useful as what is known about how it was collected. Months after a cruise, someone
will ask which calibration coefficients were applied to the TSG, whether the true winds were computed
from the port or starboard anemometer, or why there is a gap in the gravimeter record at 0300 on day
12. This page describes the tools OpenRVDAS provides for answering those questions:

* **The state journal** - a running, timestamped record of what the logger manager did: definitions
  loaded, mode changes, and loggers started, stopped, crashed and recovered.
* **`config_snapshot`** - a command that captures a cruise definition, every file it depends on, the
  version of the code and the environment it is running in, along with the journal's account of
  what is running right now.
* **Automatic snapshots** - the logger manager can take a snapshot by itself each time a cruise
  definition is loaded, and again whenever any file that definition depends on changes.

It then covers putting these together into an [archive at the end of a cruise](#archiving-a-cruise),
and [turning mode changes and logger failures into Sealog events](#creating-sealog-events-from-logger-state-changes)
so that they show up in the cruise's event log alongside everything else.

> **Version note:** everything on this page is new in OpenRVDAS v2.7.0. After upgrading, run
> `pip install -e .` with the OpenRVDAS virtual environment active, so that the `config_snapshot`
> command is installed.

# The state journal

## Where it is and what it records

From v2.7.0, the logger manager keeps a journal by default. It writes one file per day (UTC) to

```
/var/log/openrvdas/logger_manager_journal-YYYY-MM-DD
```

Each line of the file is a single event, encoded as a JSON DASRecord. The record's `message_type` is
the kind of event, and its `fields` describe it. For example, a change of mode looks like this:

```
{"data_id": "logger_manager", "message_type": "mode_changed", "timestamp": 1792677791.204,
 "fields": {"event": "mode_changed", "time": "2026-10-22T14:03:11.204Z", "from": "no_write", "to": "write"}}
```

(The real line is not wrapped.) Every event carries `event` (the same as `message_type`) and `time`
(an ISO 8601 UTC string), plus the fields below:

| Event | Recorded when | Other fields |
|---|---|---|
| `manager_start` | the logger manager starts | `host`, `user`, `pid`, `openrvdas_version`, `code` |
| `manager_stop` | the logger manager shuts down cleanly | `host`, `pid` |
| `definition_loaded` | a cruise definition is loaded | `cruise_id`, `filename`, `loaded_time`, `file_sha256`, `files` (the sha256 of every file the definition was built from) |
| `definition_files_changed` | a file the loaded definition depends on has changed on disk | `filename`, `files` (the changed files and their new sha256) |
| `mode_changed` | the active mode changes | `from`, `to` |
| `logger_started` | a logger is started | `logger`, `config`, `config_sha256`, `code`, `pid` |
| `config_changed` | a running logger is switched to a different config | `logger`, `from`, `to`, `config_sha256`, `code`, `pid` (and `crashes_before_change` if it had been crashing) |
| `logger_stopped` | a logger is stopped, or is no longer in the definition | `logger`, `config`, `reason` (and `crashes_before_stop` if it had been crashing) |
| `logger_crashed` | a logger dies unexpectedly | `logger`, `config`, `exit_code`, `code` |
| `logger_recovered` | a logger that had been crashing has stayed up | `logger`, `config`, `crashes`, `crashing_for_seconds`, `code`, `pid` |
| `logger_failed` | the logger manager gives up restarting a logger | `logger`, `config`, `crashes` |
| `snapshot_taken` / `snapshot_failed` | an [automatic snapshot](#automatic-snapshots) is written, or fails | `reason`, and `path` or `error` |

A few details are worth knowing:

* **Crashes are counted, not listed.** If a logger crashes repeatedly, only the first crash is
  journaled. The total number of crashes is reported once the logger recovers, fails, or is stopped.
  A noisy serial port won't fill the journal.
* **`code` is the version of the code a logger was started with**, as given by `git describe`. If the
  working tree has uncommitted changes, the version ends in `-dirty.` and a hash of those changes,
  e.g. `v2.7.0-3-g4f88e4b0-dirty.3fa94c1e02ab`. Two different sets of local edits get two
  different versions, so you can tell when someone patched a transform mid-cruise.
* **`config_sha256` identifies a logger config's exact contents.** A snapshot uses it to tell whether
  a running logger is running the config currently in the definition file, or an older one.

Writing to the journal can never get in the way of managing loggers. If the directory isn't
writable, the logger manager logs a single warning and carries on.

## Turning it off or moving it

The journal is controlled by the logger manager's `--state_journal` argument, which takes the path
prefix for the daily files. The default is `/var/log/openrvdas/logger_manager_journal`. Pass
`--state_journal none` to turn it off. In a standard installation, the logger manager's arguments are
in its supervisor file (see [Turning on automatic snapshots](#turning-on-automatic-snapshots) for
where that lives).

## Reading the journal

Because each line is plain JSON, `jq` and `grep` work directly on the journal. Some useful queries:

```
# Every mode change, in order
jq -r 'select(.message_type=="mode_changed")
       | "\(.fields.time)  \(.fields.from) -> \(.fields.to)"' \
   /var/log/openrvdas/logger_manager_journal-*

# Every crash or failure of any logger
jq -c 'select(.message_type | test("crashed|failed|recovered")) | .fields' \
   /var/log/openrvdas/logger_manager_journal-*

# Everything that happened to the gyro logger
grep '"logger": "gyr1"' /var/log/openrvdas/logger_manager_journal-*
```

Output of the first query looks like:

```
2026-10-23T21:23:17.443Z  null -> off
2026-10-23T21:23:17.445Z  off -> port
2026-10-24T06:10:02.918Z  port -> underway
```

(`null` is the first mode after the logger manager started.)

The journal is in the same format, and uses the same file naming, as files written by
`LogfileWriter`. That means a `LogfileReader` can read it, and follow it as it grows, which turns the
journal into a data stream that any OpenRVDAS writer can use. That is how the
[Sealog example](#creating-sealog-events-from-logger-state-changes) below works.

# Taking a snapshot

## A snapshot of what is running now

On a running system, with the OpenRVDAS virtual environment active, run

```
cd /opt/openrvdas
config_snapshot --output /var/log/openrvdas/snapshots
```

With no cruise definition named, `config_snapshot` asks the journal which definition the logger
manager loaded most recently and snapshots that. In other words, it records what is running now. It
prints the path of the snapshot it wrote:

```
/var/log/openrvdas/snapshots/MVP2610_20261023T212317Z
```

The snapshot is a directory named after the cruise id and the UTC time. To get a single file that is
easy to copy or attach to a report, add `--tar`, which also writes
`MVP2610_20261023T212317Z.tar.gz` next to the directory.

You can also snapshot a definition that isn't loaded, for example to record what you're about to
sail with:

```
config_snapshot local/uuw/mvp/MVP2610_cruise.yaml --output /var/log/openrvdas/snapshots --tar
```

| Option | Meaning |
|---|---|
| `cruise_file` | The cruise definition to snapshot. If omitted, the one the logger manager most recently loaded. |
| `--output DIR` | Where to write the snapshot (default: the current directory). |
| `--tar` | Also write the snapshot as a `.tar.gz`. |
| `--no-redact` | Don't redact passwords, tokens and other secrets in `expanded_config.yaml`. |
| `--journal PREFIX` | Where the journal is, if not in the default location; `none` to ignore it. |
| `--loaded-time YYYY-MM-DDTHH:MM:SSZ` | When the definition was loaded, if the journal can't say. Files modified since are flagged. |

## What a snapshot contains

```
MVP2610_20261023T212317Z/
  MANIFEST.yaml                 what was captured, and from where
  expanded_config.yaml          the fully expanded cruise definition, secrets redacted
  logger_manager_journal.jsonl  the journal since the logger manager last started
  sources/                      every file the definition was built from
  patches/                      "git diff HEAD" of any repository with uncommitted changes
```

**`sources/`** holds a copy of every file the cruise definition was built from, at its path relative
to the OpenRVDAS directory. A file outside that directory goes under `sources/_abs/` at its absolute
path. That means:

* the cruise definition itself;
* every file it `includes`, and every file those include. This covers logger templates and
  [calibration files](#a-note-on-symlinked-files);
* the device definition files used by any `ParseTransform` or `RegexParseTransform` (or the default
  ones, if a `ParseTransform` doesn't name any), and the files they include;
* any `LogfileWriter` header files.

The tree can be loaded again as-is, so the snapshot is enough to rerun the same processing later.

**`expanded_config.yaml`** is the cruise definition after every include, template and variable has
been expanded: exactly what the logger manager sees. It is usually the quickest way to answer "what
exactly was this logger doing?"

**`MANIFEST.yaml`** records:

* when and where the snapshot was taken, and the OpenRVDAS version;
* for each git repository a captured file came from (OpenRVDAS itself, and your institution's
  repository, [linked into `local/`]({{ "/local_code/" | relative_url }})):
  its commit, branch, tag, remote, whether it had uncommitted changes, and any untracked Python files;
* the operating system, Python version and every installed package with its version;
* each captured file with its sha256, size, modification time and git status (`clean`, `modified`,
  `untracked` or `ignored`);
* what the journal says about the definition and the loggers. See below.

## Reading the manifest

The parts of `MANIFEST.yaml` you will look at most often are at the end. Here is an excerpt from a
snapshot of a running system:

```
journal:
  source: /var/log/openrvdas/logger_manager_journal
  path: logger_manager_journal.jsonl
  entries: 5
  since: '2026-10-23T21:23:17.443Z'
  definition_loaded: '2026-10-23T21:23:17.444Z'
  definition_sha256_at_load: 01d0b856b2b8...
  definition_unchanged_since_load: true
  files_added_since_load: []
  files_removed_since_load: []
current_state:
  as_of: '2026-10-23T21:23:17.445Z'
  active_mode: 'on'
  loggers:
    tsg_cal:
      config: tsg_cal-on
      config_sha256: 88a4bd169d5a...
      code: v2.7.0
      status: running
      since: '2026-10-23T21:23:17.445Z'
      matches_definition: true
warnings: []
```

`current_state` is worked out by replaying the journal. It gives the active mode and, for each
logger, the config it is running, whether it is `running`, `crashing`, `failed` or `stopped`, and
which version of the code it was started with. That version may differ from the repository's current
one if the code has been updated since the logger started.

`matches_definition` says whether the config the logger is running is identical to the one in the
definition file now. If someone has edited the definition, or a file it includes, without reloading
it, the running loggers no longer match what is on disk, and the snapshot says so. For example, after
repointing a calibration symlink without reloading the definition:

```
WARNING: These files have changed since the definition was loaded, so may not match what
is running: sources/local/uuw/mvp/calibrations.yaml
WARNING: These loggers are running configs that differ from this definition: tsg_cal
```

Those warnings are also listed under `warnings:` in the manifest, and the changed file is marked
`modified_after_load: true` in its entry under `files:`.

## Secrets

`expanded_config.yaml` has the values of anything that looks like a password, token, secret or API
key replaced with `<redacted>`. The files under `sources/` are copied byte for byte, because they need
to be reloadable. If any of them appear to contain a secret (an InfluxDB token or a Sealog JWT, say),
`config_snapshot` prints a warning naming the files, and the manifest lists the line numbers under
`possible_secrets_on_lines`. Bear this in mind before sending a snapshot off the ship or putting it in
a public archive.

## A note on symlinked files

A common pattern, used in the [calibration example]({{ "/cookbook/calibrated_values/" | relative_url }}),
is to keep dated files under source control and point a fixed name at the current one:

```
local/uuw/mvp/calibrations.yaml -> calibrations-2026-10-01.yaml
```

A snapshot captures such a file under the name the definition used (`calibrations.yaml`), with the
contents of the file it pointed to. Its entry in `MANIFEST.yaml` records the file the link resolves
to, and its git status is that of the dated file:

```
- path: sources/local/uuw/mvp/calibrations.yaml
  source: /opt/openrvdas/local/uuw/mvp/calibrations.yaml
  resolves_to: /opt/openrvdas_uuw/mvp/calibrations-2026-10-01.yaml
  ...
```

(Here `local/uuw` is a link to the institution's own repository, checked out at
`/opt/openrvdas_uuw`, as recommended in [Your Institution's Code and Configuration]({{ "/local_code/" | relative_url }}). So
`resolves_to` shows the file's real location.) It also helps if each dated file says what it is in a
comment at the top, so the copy in `sources/` is self-explanatory:

```
# calibrations-2026-10-01.yaml: coefficients from the October 2026 shipyard period
```

# Automatic snapshots

## Turning on automatic snapshots

Given `--snapshot_dir`, the logger manager takes a snapshot by itself:

* each time a cruise definition is loaded (or reloaded); and
* each time any file that definition was built from changes on disk. It checks with one `stat()` per
  file, so this costs very little. A file that is touched but unchanged doesn't count.

Each one is recorded in the journal as `snapshot_taken` with the reason and path, or
`snapshot_failed` with the error. Snapshots are taken in the background and never delay the logger
manager.

### With the installer

To have the installer set it, add this line to the installer's preferences file,
`.install_openrvdas_preferences` (in the directory you ran the installer from):

```
DEFAULT_LOGGER_MANAGER_SNAPSHOT_DIR=/var/log/openrvdas/snapshots
```

then run `utils/install_openrvdas.sh` again. The installer doesn't ask about this setting. It is
empty by default, which means no automatic snapshots. Once it is set, the installer keeps it on
later runs, and `utils/switch_ui.sh` keeps it when switching consoles.

### By hand

Or add the option yourself to the logger manager's command line in its supervisor file:

| System | File |
|---|---|
| Ubuntu/Debian | `/etc/supervisor/conf.d/openrvdas_logger_manager.conf` |
| CentOS/RHEL/Rocky | `/etc/supervisord.d/openrvdas_logger_manager.ini` |
| macOS (Homebrew) | `/opt/homebrew/etc/supervisor.d/openrvdas_logger_manager.ini` (`/usr/local/etc/...` on Intel Macs) |

Append `--snapshot_dir` to the `command=` line, e.g.

```
command=/opt/openrvdas/venv/bin/python server/logger_manager.py --database django --data_server_websocket :8766 -v -V --no-console --snapshot_dir /var/log/openrvdas/snapshots
```

then restart the logger manager:

```
sudo supervisorctl reread
sudo supervisorctl update
```

A hand edit is lost the next time the installer runs, unless the preference above is set too.

### Either way

Make sure the directory exists and is writable by the user OpenRVDAS runs as:

```
sudo mkdir -p /var/log/openrvdas/snapshots
sudo chown rvdas /var/log/openrvdas/snapshots
```

## Checking that it works

After loading a cruise definition, you should see a new directory in the snapshot directory, and a
`snapshot_taken` line at the end of today's journal:

```
ls -t /var/log/openrvdas/snapshots | head -1
grep snapshot_ /var/log/openrvdas/logger_manager_journal-$(date -u +%F) | tail -1
```

If you see `snapshot_failed`, its `error` field says why. The usual cause is a directory that the
OpenRVDAS user can't write to.

# Archiving a cruise

At the end of a cruise, the goal is a self-contained record that will still answer questions when
the system it came from has been reconfigured for the next cruise. Collect the following next to the
data, in one directory:

1. **A final snapshot of what is running**, taken before anything is shut down or changed:

   ```
   config_snapshot --output $ARCHIVE --tar
   ```

2. **Every automatic snapshot taken during the cruise.** Together, these record each change to the
   configuration as it happened.

3. **The whole journal.** A snapshot includes only the journal since the logger manager last
   started, and the logger manager may have been restarted several times during the cruise. The
   journal files are small (one line per event), so the simplest thing is to copy all of them.

4. **The loggers' stderr files**, from `/var/log/openrvdas/loggers/` (from v2.7.0; earlier versions
   wrote them directly under `/var/log/openrvdas/`). The journal tells you *that* a logger crashed at
   0300. Its stderr file usually tells you *why*. They rotate, so copy them before they're
   overwritten.

5. **A tag in your institution's repository** (see [Your Institution's Code and Configuration]({{ "/local_code/" | relative_url }})),
   so the configuration can be checked out exactly as it was:

   ```
   cd /opt/openrvdas_uuw            # your institution's repository, linked as local/uuw
   git status                       # commit anything uncommitted first
   git tag MVP2610-end
   git push --tags
   ```

   If `git status` shows uncommitted changes, commit them before tagging. The snapshot will have
   saved them in `patches/` anyway, but a commit is easier to find later.

Putting the first four steps together:

```
CRUISE=MVP2610
ARCHIVE=/data/$CRUISE/openrvdas_records
mkdir -p $ARCHIVE/snapshots $ARCHIVE/journal $ARCHIVE/logger_stderr

cd /opt/openrvdas
source venv/bin/activate

# 1. The final state
config_snapshot --output $ARCHIVE --tar

# 2. Everything snapshotted along the way
cp -a /var/log/openrvdas/snapshots/${CRUISE}_* $ARCHIVE/snapshots/

# 3. The journal
cp -a /var/log/openrvdas/logger_manager_journal-* $ARCHIVE/journal/

# 4. Logger stderr
cp -a /var/log/openrvdas/loggers/. $ARCHIVE/logger_stderr/
```

For a quick record partway through a cruise, step 1 alone is enough: one `config_snapshot` captures
the configuration, the code version and the current state of every logger.

# Creating Sealog events from logger state changes

If your ship runs [Sealog](https://github.com/OceanDataTools/sealog-server), it's useful to have
mode changes, and loggers that have stopped working, appear in the event log next to everything
else. A watchstander scrolling back through the night's events then sees "mode changed to
underway" and "gravimeter logger failed" in context. Since the journal is a data stream like any
other, a logger can do this with three components:

* a `LogfileReader` that follows the journal;
* a [`ComputedFieldsTransform`]({{ "/computed_fields/" | relative_url }}) that picks out the events of
  interest and turns their fields into Sealog event fields, dropping everything else;
* a `SealogWriter` that posts the result to the Sealog server.

## The logger

Add a logger like this to your cruise definition:

```
loggers:
  journal_to_sealog:
    configs:
      'off': {}
      'on':
        readers:
          class: LogfileReader
          kwargs:
            filebase: /var/log/openrvdas/logger_manager_journal
            tail: true               # follow the journal as it grows
            refresh_file_spec: true  # and move on to each new day's file

        transforms:
        - class: ComputedFieldsTransform
          kwargs:
            # Output only what is computed below, and nothing at all for
            # events we're not interested in.
            delete_input_fields: true
            delete_other_fields: true
            fields:
              # SealogWriter uses these three field names as the event's
              # value, free text and options.
              event_value:
                equation: "'MODE_CHANGE' if event == 'mode_changed' else 'LOGGER_FAILED' if event == 'logger_failed' else 'LOGGER_CRASHED' if event == 'logger_crashed' else None"
              event_free_text:
                equation: "'Logger mode changed to ' + new if event == 'mode_changed' else None"
                inputs: {new: to}
              event_option_mode:
                equation: "new if event == 'mode_changed' else None"
                inputs: {new: to}
              event_option_previous_mode:
                equation: "old if event == 'mode_changed' else None"
                inputs: {old: from}
              event_option_logger:
                equation: "lg if event == 'logger_failed' or event == 'logger_crashed' else None"
                inputs: {lg: logger}
              event_option_config:
                equation: "cfg if event == 'logger_failed' or event == 'logger_crashed' else None"
                inputs: {cfg: config}

        writers:
          class: SealogWriter
          module: logger.writers.sealog_writer
          kwargs:
            url: http://sealog.mvp.uuw.edu:8000/sealog-server
            token: <<sealog_token>>
            config_file: local/uuw/mvp/sealog_events.yaml
```

and the file it names as `config_file`, `local/uuw/mvp/sealog_events.yaml`, which tells
`SealogWriter` how to turn records whose `data_id` is `logger_manager` (all journal records) into
events:

```
logger_manager:
  event_author: openrvdas
```

How it works:

* Each rule's equation returns `None` unless the record is an event we want, and a rule that returns
  `None` produces nothing. With `delete_other_fields: true`, a record that produces nothing is
  dropped completely, so `manager_start`, `logger_started` and the rest never reach Sealog.
* The journal's field names `to` and `from` are given aliases under `inputs`, because `from` is a
  reserved word in Python and so can't appear in an equation by name.
* The first mode change after the logger manager starts has `from: null`. A rule with a null input
  doesn't fire, so that event simply has no `previous_mode` option.
* Each field named `event_option_X` becomes an event option named `X`. To give options different
  names, add a `field_map` to the Sealog config file, mapping `X` to the name you want.
* The event is timestamped with the journal's time for it, not the time it was posted.

Given the journal lines for a crash and a mode change, the logger produces these two events:

```
{'event_author': 'openrvdas',
 'event_free_text': '',
 'event_options': [{'event_option_name': 'logger', 'event_option_value': 'gyr1'},
                   {'event_option_name': 'config', 'event_option_value': 'gyr1-net'}],
 'event_value': 'LOGGER_CRASHED',
 'ts': '2026-10-23T21:20:21.368767Z'}
{'event_author': 'openrvdas',
 'event_free_text': 'Logger mode changed to underway',
 'event_options': [{'event_option_name': 'mode', 'event_option_value': 'underway'},
                   {'event_option_name': 'previous_mode', 'event_option_value': 'port'}],
 'event_value': 'MODE_CHANGE',
 'ts': '2026-10-23T21:20:21.368819Z'}
```

To post other events too, such as `logger_recovered` or `definition_loaded`, extend the equations
in the same way.

## Things to watch for

* **The logger reads the journal from the beginning each time it starts.** `LogfileReader` has no
  option to start at the end of a file, so when this logger starts, it posts every matching event
  already in the journal files. To keep that to a minimum, give the logger *the same config in every
  mode*: the logger manager restarts a logger only when its config changes, so a mode change then
  won't restart it. It will still replay the journal when the logger manager itself restarts.
  To limit how much a restart replays, you can archive and remove older journal files once you no
  longer need them on the live system.
* **Keep the token out of shared files if you can.** `SealogWriter` needs a JWT. Above, it comes from
  a variable, `<<sealog_token>>`, so it can be defined in a separate included file that isn't
  committed to a public repository. Snapshots copy that file too, and will
  [warn you](#secrets) that it contains a token.
* **`ToSealogTransform` and `SealogWriter` need `module:`.** Neither is imported by default, so
  give `module: logger.transforms.to_sealog_transform` or `module: logger.writers.sealog_writer`
  with the class.

## Trying it out without a Sealog server

To see the events this logger would post, without posting them, replace the writer with
`ToSealogTransform` and print the result. Running a config like this with `listen` prints each
event as a (harmless) warning that `TextFileWriter` can't write it:

```
readers:
  class: LogfileReader
  kwargs:
    filebase: /var/log/openrvdas/logger_manager_journal
transforms:
- class: ComputedFieldsTransform
  kwargs:
    ...                                # as above
- class: ToSealogTransform
  module: logger.transforms.to_sealog_transform
  kwargs:
    config_file: local/uuw/mvp/sealog_events.yaml
writers:
  class: TextFileWriter
```

Without `tail: true`, the reader stops at the end of the journal, so this is also a quick way to
see every event a new logger would post the first time it starts.
