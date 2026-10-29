---
permalink: /guide/operations/
title: '8\. Operations and Recordkeeping'
layout: single
toc: true
toc_label: "In this section"
toc_icon: "list"
toc_sticky: true
---
The earlier sections were about setting a system up. This one is about
running it through a real cruise:

* **State journaling and snapshots** - keeping a record of what ran, so questions can be answered months
  later;
* **Command-line and API control** - controlling the system from the command line or from other
  programs, without the web console;
* **Geofencing and conditional control** - letting the ship's position, or the data itself, change logger
  configurations automatically.

# Snapshots and the State Journal

Data is only as useful as what is known about how it was collected. Researchers depending on the data will need to be able to answer questions like:

* Which calibration coefficients were applied to the TSG?
* Were the true winds computed from the port or the starboard
  anemometer?
* Why is there a gap in the gravimeter record at 0300 on day 12?

OpenRVDAS v2.7.0 added three tools for answering them:

* the **state journal**, a running log of everything the logger
  manager does;
* **`config_snapshot`**, a command that saves a complete copy of a
  configuration;
* **automatic snapshots**, which the logger manager takes whenever the
  configuration changes.

## The state journal

The logger manager keeps a journal of everything it does. It's on by
default from v2.7.0. The journal records:

* each cruise definition that is loaded;
* each change of cruise mode;
* each logger that is started, stopped, switched to a different
  configuration, crashes, recovers, or is given up on;
* each time a file the loaded definition was built from changes on
  disk, such as a calibration file being edited.

Each entry gives the time, the logger and configuration involved, and
the version of the OpenRVDAS code the logger was running. If someone
had edited the code without committing the change, the version shows
that too, so you can tell when a transform was patched mid-cruise.

The journal is written as one file per day (UTC), named
`/var/log/openrvdas/logger_manager_journal-YYYY-MM-DD`. Each line of
the file is one event in JSON. A change of mode looks like this
(it's a single line in the file):

```
{"data_id": "logger_manager", "message_type": "mode_changed", "timestamp": 1792677791.204,
 "fields": {"event": "mode_changed", "time": "2026-10-22T14:03:11.204Z", "from": "no_write", "to": "write"}}
```

A logger that keeps crashing won't fill the journal. Only its first
crash is recorded, and the total number of crashes is recorded when
the logger recovers, fails or is stopped. And the journal can never
interfere with running loggers: if the logger manager can't write it,
it logs a warning and carries on.

Since each line is plain JSON, you can search the journal with `jq` or
`grep`:

```
# Every mode change, in order
jq -r 'select(.message_type=="mode_changed")
       | "\(.fields.time)  \(.fields.from) -> \(.fields.to)"' \
   /var/log/openrvdas/logger_manager_journal-*

# Everything that happened to the gyro logger
grep '"logger": "gyr1"' /var/log/openrvdas/logger_manager_journal-*
```

The journal uses the same format as the logfiles a `LogfileWriter`
writes. That means a logger can read it with a `LogfileReader`, just
as it would read instrument data. The
[Sealog example](#logger-events-in-sealog) below uses this.

To move the journal or turn it off, use the logger manager's
`--state_journal` argument (`--state_journal none` turns it off). The
full list of journal events, with the fields each one carries, is on
the legacy [Recording What Ran]({{ "/cruise_records/" | relative_url }})
page.

## Taking a snapshot

The journal records what happened. A snapshot records what the
configuration was. To take one of a running system:

```
cd /opt/openrvdas
config_snapshot --output /var/log/openrvdas/snapshots
```

`config_snapshot` will look in the journal to find the cruise
definition that is currently loaded, and snapshot that. It will print
the location of the snapshot, a directory named after the cruise id
and the time. A few variations:

* Add `--tar` to also get the snapshot as a single `.tar.gz` file,
  handy for attaching to a report.
* Name a cruise definition file to snapshot that file instead, whether
  or not it's loaded. This is useful for recording what you're about
  to sail with.
* If the journal isn't in its usual place, say where with
  `--journal`. If there is no journal at all, `--loaded-time` tells
  `config_snapshot` when the definition was loaded, so it can still
  flag files changed since then.

A snapshot directory contains:

```
MVP2610_20261023T212317Z/
  MANIFEST.yaml                 what was captured, and from where
  expanded_config.yaml          the fully expanded cruise definition, secrets redacted
  logger_manager_journal.jsonl  the journal since the logger manager last started
  sources/                      every file the definition was built from
  patches/                      "git diff HEAD" of any repository with uncommitted changes
```

What each part is for:

* **`sources/`** has a copy of every file the cruise definition was
  built from: the definition itself, the templates and calibration
  files it includes, and the device definitions its parsers use. With
  these, the configuration can be loaded again later, exactly as it
  was.
* **`expanded_config.yaml`** is the cruise definition with every
  include, template and variable filled in. It's exactly what the
  logger manager saw, and usually the quickest way to answer "what was
  this logger actually doing?"
* **`logger_manager_journal.jsonl`** is the journal since the logger
  manager last started: what was loaded, which mode was set, and what
  each logger has been doing.
* **`patches/`** holds any uncommitted changes to the code or to your
  configuration files, so that even an unofficial fix made at sea is
  on record.
* **`MANIFEST.yaml`** records the versions of everything involved:
  OpenRVDAS, your
  [institution's repository]({{ "/guide/your-vessel/#your-institutions-repository-and-local" | relative_url }}),
  the operating system, Python and every installed package. It also
  records what state each logger was in when the snapshot was taken.

That last item is often the most useful. For each logger, the manifest
says which configuration it was running, whether it was running
normally, crashing or stopped, and whether its configuration matches
the definition file on disk. If someone edits a calibration file and
forgets to reload the definition, the running loggers are still using
the old values, and the snapshot will warn you:

```
WARNING: These files have changed since the definition was loaded, so may not match what
is running: sources/local/uuw/mvp/calibrations.yaml
WARNING: These loggers are running configs that differ from this definition: tsg_cal
```

If a file is a symbolic link, such as a `calibrations.yaml` that
points to a dated calibration file, the snapshot saves the contents of
the file it points to and notes that file's name in the manifest. So
the [dated calibration files]({{ "/guide/computed-values/#calibrations" | relative_url }})
convention leaves an exact record of which coefficients were in use.

**A caution about secrets.** In `expanded_config.yaml`, anything that
looks like a password, token or API key is replaced with
`<redacted>`. The files in `sources/` are copied unchanged, though, so
that they can be loaded again. If any of them seem to contain a
secret, `config_snapshot` will warn you and name the files. Check
before sending a snapshot off the ship.

## Automatic snapshots

You don't have to remember to take snapshots. The logger manager can
take them for you, and it will do so at two moments:

* whenever a cruise definition is loaded or reloaded;
* whenever one of the files the definition was built from changes,
  such as a calibration file or a logger template.

Checking for changed files costs almost nothing, and snapshots are
written in the background, so turning this on won't slow the system
down. Each one is about 200 KB for the sample NBP cruise. They're
worth having on any real installation.

The installer asks whether you want automatic snapshots, and where to
keep them. If you said no and change your mind, rerun the installer
and say yes. The setting is the logger manager's `--snapshot_dir`
argument, for example `--snapshot_dir /var/log/openrvdas/snapshots`.

To check that it's working, load a cruise definition. A new snapshot
directory should appear, and the journal should record it:

```
# Show the newest snapshot directory
ls -t /var/log/openrvdas/snapshots | head -1

# Show the most recent snapshot event in today's journal
grep snapshot_ /var/log/openrvdas/logger_manager_journal-$(date -u +%F) | tail -1
```

The journal line will say `snapshot_taken` if all went well. If it
says `snapshot_failed`, its `error` field gives the reason. The usual
cause is that the OpenRVDAS user isn't allowed to write to the
snapshot directory.

## Archiving a cruise

At the end of a cruise, save a record that will still answer
questions after the system has been set up for the next cruise. Put
these next to the cruise's data:

1. **A final snapshot**, taken before anything is shut down or
   changed.
2. **All the automatic snapshots** from the cruise. Together they
   show every change to the configuration, as it happened.
3. **The whole journal.** Each snapshot includes the journal only
   since the logger manager last started, and it may have been
   restarted during the cruise. The journal files are small, so copy
   them all.
4. **The loggers' stderr files**, from `/var/log/openrvdas/loggers/`.
   The journal tells you *that* a logger crashed at 0300; its stderr
   file usually tells you *why*. Only a limited number of old stderr
   files are kept, so copy them before they're gone.
5. **A tag in your institution's repository**, such as
   `git tag MVP2610-end`, so the configuration can be checked out
   later exactly as it was.

Steps 1 to 4 as commands:

```
CRUISE=MVP2610
ARCHIVE=/data/$CRUISE/openrvdas_records
mkdir -p $ARCHIVE/snapshots $ARCHIVE/journal $ARCHIVE/logger_stderr

# 1. A final snapshot of what is running
config_snapshot --output $ARCHIVE --tar

# 2. All the automatic snapshots from the cruise
cp -a /var/log/openrvdas/snapshots/${CRUISE}_* $ARCHIVE/snapshots/

# 3. The whole journal
cp -a /var/log/openrvdas/logger_manager_journal-* $ARCHIVE/journal/

# 4. The loggers' stderr files
cp -a /var/log/openrvdas/loggers/. $ARCHIVE/logger_stderr/
```

For a quick record partway through a cruise, step 1 alone is enough.
One snapshot captures the configuration, the code version and the
state of every logger.

## Logger events in Sealog

If your ship runs [Sealog](https://github.com/OceanDataTools/sealog-server),
it helps to have mode changes and logger failures appear in its event
log. A watchstander looking back through the night's events will then
see "mode changed to underway" or "gravimeter logger failed" alongside
everything else that happened.

Because a logger can read the journal, an ordinary logger can do this.
It needs three components:

* a **`LogfileReader`** that follows the journal as it grows;
* a **[`ComputedFieldsTransform`]({{ "/guide/computed-values/#computed-fields" | relative_url }})**
  that picks out the events you want and turns each one into the
  fields a Sealog event needs, dropping all the others;
* a **`SealogWriter`** that posts the events to the Sealog server.

Two things to get right:

* Give this logger the same configuration in every cruise mode. When a
  logger restarts, it rereads the journal from the beginning and posts
  those events again. A logger whose configuration doesn't change
  won't be restarted by a mode change.
* The `SealogWriter` needs an access token. Keep it in a separate
  included file that isn't committed to your repository.

The complete logger configuration is on the legacy
[Recording What Ran]({{ "/cruise_records/#creating-sealog-events-from-logger-state-changes" | relative_url }})
page.

# Command-Line and API Control

Anything you can do in the web console, you can also do from the
command line or from another program. There are three ways.

The python script **`lmcmd`** sends commands to the running logger manager. It takes the
same commands the console uses:

```
# Load a cruise definition
lmcmd load_configuration local/uuw/mvp/MVP2610_cruise.yaml

# List the modes it defines, then switch to one
lmcmd get_modes
lmcmd set_active_mode underway

# List one logger's configurations, then switch it to one
lmcmd get_logger_configs gyr1
lmcmd set_active_logger_config gyr1 gyr1-off

# Reload the definition after its files have changed
lmcmd reload_configuration
```

Run it with no arguments for an interactive `command?` prompt, where
`help` lists every command. `lmcmd` is useful:

* on an installation with no web console;
* for a cron job that changes the mode at a set time;
* when the console is down and you still need to control the loggers;
* for reloading the definition from a script after changing a
  calibration file, so the loggers pick up the new values.

`lmcmd` works with the Django console's database, and with the SQLite
one (`--database sqlite`). With the React console, use its API
instead.

**The REST API** lets other programs control the logger manager.
The Django console provides endpoints such as
`api/select-cruise-mode/`, `api/load-configuration-file/` and
`api/edit-logger-config/`. You can browse and try them all at
`/api/schema/swagger-ui/`. Requests need an authentication token,
which `api/obtain-auth-token/` issues in exchange for a console
username and password. The React console has its own API, documented
at `/docs` and `/redoc` if you chose to make those pages available
when you installed it.

To *watch* the system from a program, subscribe to the cached data
server. The logger manager publishes the state of the cruise and of
every logger there, in the `status:cruise_definition` and
`status:logger_status` fields, and each logger's error output appears
in `stderr:` fields. This is how the console itself gets its status.
The legacy [Controlling Loggers]({{ "/controlling_loggers/" | relative_url }})
page lists all the endpoints, and shows how to add your own.

**The logger manager can also be run by hand**, which is handy on a
test machine:

```
logger_manager --config local/uuw/mvp/MVP2610_cruise.yaml --mode port
```

This loads the definition and sets the mode. Run this way, the logger
manager keeps its state in memory and gives you its own `command?`
prompt. (The installed service runs it differently: with
`--database django` or `--database fastapi` so that the console can
talk to it, and `--no-console`.) A few of its other arguments are
worth knowing:

* `--state_journal` sets where the journal is written;
* `--snapshot_dir` turns on automatic snapshots;
* `--stderr_file_pattern` sets where each logger's error output goes.
  The default is `/var/log/openrvdas/loggers/{logger}.stderr`. Each
  file is rotated when it reaches 1 MB, and up to 100 older files are
  kept.

# Geofencing and Conditional Control

Some mode changes depend on where the ship is. You might start logging
as the ship leaves port, but only start recording data from certain instruments when clear of a foreign port's EEZ, stopping again when you re-enter the EEZ. A watchstander
has to remember to make each of these changes, often at an
inconvenient hour.

OpenRVDAS can make them automatically. A command to the logger
manager, such as `set_active_mode underway`, is just a piece of text,
and a logger can write it like any other record. So a logger can
watch the data and change the mode when it sees the right condition.

Such a logger has three parts:

* a reader that receives the parsed data;
* a transform that outputs a command when a condition is met;
* a **`LoggerManagerWriter`**, which passes the command to the logger
  manager.

For geofencing, the transform is a `GeofenceTransform`. It needs the
ship's position as signed decimal degrees: negative for south and
west. The bundled NMEA device definitions don't provide that
directly. They give latitude and longitude as positive numbers, with
the hemisphere in a separate field (`SeapNorS` is `N` or `S`).
Without a conversion, the fence would be checking the wrong position
anywhere south of the equator or west of Greenwich, including
everywhere in the Argentine EEZ used below.

So the example uses two loggers:

* a **position logger**, which converts the GPS position to signed
  degrees and writes it back to the cached data server, where a map
  display or anything else that wants a signed position can use it
  too;
* the **geofence logger**, which reads the signed position and acts
  on it.

Both read from the cached data server, not from the UDP broadcast.
The broadcast carries raw records; the named, parsed fields only
exist once the `parse_data` logger has parsed them. The example uses
the sample cruise's Seapath GPS (`seap`).

**The position logger** is a derived-data logger of the kind described
in [section 6]({{ "/guide/computed-values/#derived-data-loggers" | relative_url }}):

```
readers:
  class: CachedDataReader
  kwargs:
    data_server: localhost:8766
    subscription:
      fields:
        SeapLatitude: {seconds: 0}
        SeapNorS: {seconds: 0}
        SeapLongitude: {seconds: 0}
        SeapEorW: {seconds: 0}

transforms:
  - class: ComputedFieldsTransform
    kwargs:
      update_on_fields: [SeapLatitude]
      max_field_age: {SeapNorS: 10, SeapLongitude: 10, SeapEorW: 10}
      delete_input_fields: true
      delete_other_fields: true
      fields:
        SeapSignedLatitude:
          equation: "lat * (-1 if ns == 'S' else 1)"
          inputs: {lat: SeapLatitude, ns: SeapNorS}
        SeapSignedLongitude:
          equation: "lon * (-1 if ew == 'W' else 1)"
          inputs: {lon: SeapLongitude, ew: SeapEorW}

writers:
  class: CachedDataWriter
  kwargs:
    data_server: localhost:8766
```

Each time a new latitude arrives, this computes `SeapSignedLatitude`
and `SeapSignedLongitude` from the latest values of the four input
fields and publishes them together in one record. (The caching
options are explained under
[Computed Fields]({{ "/guide/computed-values/#computed-fields" | relative_url }}).)
To check it, with the system in a mode that parses data:

```
listen --cached_data SeapSignedLatitude,SeapSignedLongitude
```

**The geofence logger** then needs nothing but the three parts:

```
readers:
  class: CachedDataReader
  kwargs:
    data_server: localhost:8766
    subscription:
      fields:
        SeapSignedLatitude: {seconds: 0}
        SeapSignedLongitude: {seconds: 0}

transforms:
  - class: GeofenceTransform
    module: logger.transforms.geofence_transform
    kwargs:
      latitude_field_name: SeapSignedLatitude
      longitude_field_name: SeapSignedLongitude
      boundary_file_name: local/uuw/mvp/boundaries/argentina_eez.gml
      entering_boundary_message: set_active_mode eez
      leaving_boundary_message: set_active_mode underway

writers:
  - class: LoggerManagerWriter
    module: logger.writers.logger_manager_writer
    kwargs:
      database: django
      allowed_prefixes:
        - 'set_active_mode '
        - 'sleep '
```

Here's what happens:

1. The `CachedDataReader` receives the signed position. Because the
   position logger publishes latitude and longitude together, they
   arrive together, in one record.
2. The `GeofenceTransform` compares each position with the boundary.
   When the ship crosses into the boundary, it outputs
   `set_active_mode eez`. When the ship crosses out, it outputs
   `set_active_mode underway`. The rest of the time it outputs
   nothing.
3. The `LoggerManagerWriter` passes the command to the logger manager,
   which will change the mode. The change is recorded in the journal
   like any other.

Boundary files are in GML format. EEZ boundaries can be downloaded
from [marineregions.org](https://marineregions.org/eezsearch.php).

The conversion step could instead be done by the parser. OpenRVDAS
has an `nlat_dir` format type that parses an NMEA position together
with its hemisphere letter straight into signed degrees. A device
type written with it would publish signed positions from the start,
and the position logger wouldn't be needed. The bundled NMEA
definitions use the plain `nlat` type, so for now the position logger
is the simplest route.

**Where to put the two loggers.** Both go in the cruise definition
like any other logger, with a configuration for each mode. The
position logger should run in every mode where anything uses its
output, which usually means every mode except `off`. For the geofence
logger, two things follow from how the transform works:

* The transform treats the first position it sees as a crossing. So
  as soon as the logger starts, it will set the mode to match where
  the ship is. That's useful after a restart, but it also means the
  logger should be `off` in any mode it shouldn't override. If it ran
  in `port` mode, for example, it would move the ship out of `port`
  mode the moment it started.
* Give it the same configuration in every mode where it runs. A mode
  change restarts only the loggers whose configuration changes, and a
  restarted geofence logger will issue a fresh mode command at once.

**Before relying on it, test it.** Make a copy of the logger
configuration with the `LoggerManagerWriter` replaced by a
`TextFileWriter`, and run it with `listen` while the system is in a
mode that parses data. The commands the geofence would have sent will
be printed instead of acted on. To see a crossing, a test boundary
drawn around the ship's current position works well.

Some options worth knowing:

* **`distance_from_boundary_in_degrees`** moves the fence inside the
  boundary (negative values) or outside it, so the mode changes a
  little before the ship reaches the line. The distance is in degrees
  rather than nautical miles because converting between the two
  depends on where you are.
* **`seconds_between_checks`** limits how often the position is
  checked, to save work on a fast GPS feed.
* **`boundary_dir_name`** uses every `.gml` file in a directory, with
  the fence around all of them together. One way to use it: keep all
  the EEZ files you might need in one directory, and link the ones in
  force into another. To change the fence, add or remove a link, then
  switch the geofence logger `off` and back `on`.
* **`allowed_prefixes`** on the writer is a safety check. Only commands
  that start with one of these prefixes are passed to the logger
  manager. In this example, the logger can change the mode and nothing
  else.

The writer also accepts several commands in one record, separated by
semicolons, and a `sleep N` command that waits N seconds between
them.

Two requirements:

* The `GeofenceTransform` needs packages that aren't installed by
  default. With the virtual environment active, from the OpenRVDAS
  directory:

  ```
  pip install -e '.[geofence]'
  ```

* The `LoggerManagerWriter` reaches the logger manager through its
  database, and as of v2.7.0 it can use the Django, SQLite or
  in-memory one, but not the React console's. On a system running the
  React console, the writer can't deliver its commands.

Note that the configuration names a `module:` for the
`GeofenceTransform` and the `LoggerManagerWriter`. `listen` doesn't
load those two automatically.

**The same approach works with any field, not just position.** The
`QCFilterTransform` outputs a command when a field goes outside a
range you set. This one declares the ship underway once its speed is
over half a knot:

```
transforms:
  - class: QCFilterTransform
    kwargs:
      bounds: 'S330SpeedKt:0.0:0.5'
      message: set_active_mode underway
```

`bounds` gives the *normal* range for a field, as
`field:lowest:highest`. You can list several fields, separated by
commas. When a value goes outside its range, the transform outputs the
message.

Two things to be aware of:

* It only works in one direction. To switch back when the ship slows
  down, add a second logger with the opposite range.
* Unlike the `GeofenceTransform`, which speaks only when the ship
  crosses a boundary, the `QCFilterTransform` outputs its message for
  *every* record that is out of range. Here, that means the logger
  manager will be told to set `underway` mode with every GPS record
  for as long as the ship is moving. Each time, every logger is put
  back into its configuration for that mode. So if a watchstander
  switches one logger off by hand, it won't stay off. Use this
  approach only where that's acceptable.

For more complicated rules, use a
[`ComputedFieldsTransform`]({{ "/guide/computed-values/#computed-fields" | relative_url }})
whose equation produces the command when its condition is met, and
nothing otherwise. The `LoggerManagerWriter` works the same way
whichever transform feeds it.
