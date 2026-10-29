---
permalink: /computed_fields/
title: "Computed Fields: ComputedFieldsTransform"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
`ComputedFieldsTransform` computes new fields from algebraic expressions over the fields of the
records passing through it. It handles anything from a one-line linear calibration to a calculation
like true winds that combines readings from several instruments, without writing any Python. The
arithmetic lives in the cruise definition.

This page starts with a single computed field and builds up from there:

* [A first example](#a-first-example): one field, one equation
* [Writing equations](#writing-equations): what an equation may contain
* [Several rules, and rules in sequence](#several-rules-and-rules-in-sequence)
* [Keeping or dropping fields](#keeping-or-dropping-fields)
* [Combining instruments](#combining-instruments): inputs that arrive in different records
* [Checking a configuration](#checking-a-configuration): catching mistakes before a logger runs
* [True winds](#true-winds): a complete worked example
* [Reference](#reference): every option

For best practices in applying calibration coefficients, and keeping them in dated, version-controlled calibration
files that can be updated without touching the cruise definition, see
[Calibrated Values for Sensor Data]({{ "/cookbook/calibrated_values/" | relative_url }}).

> **Version note:** `ComputedFieldsTransform` is new in OpenRVDAS v2.7.0. It is the general case of `ModifyValueTransform` and
> `calibration_logger_template`, which remain available for the linear slope-and-offset case.

# A first example

Suppose the TSG reports `SeawaterTemp`, and its calibration sheet says the true temperature is
`1.00021 × reading − 0.0032`. A transform that adds a calibrated field to each record looks like this:

```
- class: ComputedFieldsTransform
  kwargs:
    fields:
      SeawaterTempCal:
        equation: "slope * SeawaterTemp + offset"
        constants:
          slope: 1.00021
          offset: -0.0032
```

Each entry under `fields` is a **rule**. The rule's name (`SeawaterTempCal`) is the field it
produces. Its `equation` is evaluated for each record: bare names in the equation refer to the
record's fields (`SeawaterTemp`) or to the rule's `constants` (`slope`, `offset`). Given

```
{'SeawaterTemp': 12.5, 'Salinity': 34.2}
```

the transform returns

```
{'SeawaterTemp': 12.5, 'Salinity': 34.2, 'SeawaterTempCal': 12.499425}
```

The transform accepts and returns DASRecords, field dicts, or dicts with a `fields` key, so it can
go anywhere in a logger after the record has been parsed.

A record that doesn't have a rule's input fields is passed through unchanged. A stream often
carries many kinds of record, and only some of them will have the fields a given rule needs.

# Writing equations

An equation is a Python-style expression. It may use:

* **Arithmetic:** `+ - * / // % **`. `%` is handy for wrapping angles: `(dir + offset) % 360`.
* **Comparisons and logic:** `== != < <= > >=`, `and`, `or`, `not`.
* **Conditional expressions:** `x if condition else y`.
* **Numbers, strings, `True`, `False` and `None`.** Field values are passed through as they arrive
  and are not converted, so a hemisphere field holding `'N'` or `'S'` can be compared directly:
  `Lat * (-1 if LatHemi == 'S' else 1)`.
* **These functions:** `abs`, `min`, `max`, `round`, `pow`, `int`, `float`, `exp`, `log`, `log10`,
  `sqrt`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `hypot`, `degrees`, `radians`,
  `floor`, `ceil`, `fmod`. The trig functions work in radians, as in Python's `math` module.
* **The constants `pi` and `e`.**

Anything else is refused: attribute access (`x.real`), indexing, keyword arguments, lambdas,
comprehensions, and calls to anything not in the list above. There are also some limits on size:

* The exponent of `**` must be a literal number no bigger than 64. `T**2` is fine; `T**n` and
  `9**9**9` are not. Without this limit, an innocent-looking expression could hang the logger.
* An equation may be at most 1000 characters long. A calibration longer than that is probably
  clearer as several rules (see [rules in sequence](#several-rules-and-rules-in-sequence)).

Equations are checked when the logger starts, not when the first record arrives, and
[`validate_config`](#checking-a-configuration) checks them before that. A typo or a
refused construct stops the logger right away with an error saying what is wrong, e.g.

```
Class ComputedFieldsTransform: field "SeawaterTempCal": Attribute is not allowed in an equation.
Equations may use arithmetic, comparisons, conditional expressions and the functions abs, acos, ...
```

If an equation fails on a particular record, for example dividing by zero or taking the log of a
negative number, no value is produced for that record. A warning is logged the first time and then
suppressed, so a bad reading at 10 Hz doesn't bury the log.

## Constants

Values under a rule's `constants` are available to its equation by name. They may be numbers,
booleans or strings. Using a boolean constant puts a choice in the configuration rather than in the
equation:

```
DepthCorrected:
  equation: "(Pressure - (10.1325 if pressure_is_absolute else 0)) * conv_coefficient"
  constants:
    pressure_is_absolute: true
    conv_coefficient: 1.0
```

**A constant whose value is `null` disables its rule.** The transform logs that it isn't computing
the field because the device is presumably uncalibrated, and the rest of the logger carries on. That
is the intended way to say "we have no calibration for this sensor yet". It also matters for
[calibration files]({{ "/cookbook/calibrated_values/" | relative_url }}).

## Aliases for input fields

`inputs` maps names used in the equation to the record fields they stand for. This lets a standard
formula be written in textbook notation and pointed at whatever the fields are called on your ship:

```
SoundVelocity:
  equation: "1449.2 + 4.6*T - 0.055*T**2 + 1.39*(S - 35) + 0.016*D"
  inputs: {T: SeawaterTemp, S: Salinity, D: Depth}
```

Aliases are also the way to use fields whose names can't appear in an equation: names that aren't
valid Python identifiers (`Temp-1`, `2ndGPSLat`), or that are Python keywords (`from`, `in`,
`lambda`). For example, `inputs: {old: from}` lets the equation use the field `from` as `old`.

# Several rules, and rules in sequence

A transform can have any number of rules, and each can draw on any fields in the record:

```
fields:
  SeawaterTempCal:
    equation: "slope * SeawaterTemp + offset"
    constants: {slope: 1.00021, offset: -0.0032}
  ChlCal:
    equation: "scale * (FluoroCounts - dark)"
    constants: {scale: 0.0123, dark: 48}
```

Rules are evaluated **in the order they are listed**, and an equation can use the result of any rule
listed *before* it, by that rule's name. Mark a rule `intermediate: true` to make its result
available to later rules without adding it to the output:

```
fields:
  x:
    equation: "wspd * cos(radians(270 - wdir))"
    inputs: {wspd: WindSpeed, wdir: WindDir}
    intermediate: true
  y:
    equation: "wspd * sin(radians(270 - wdir))"
    inputs: {wspd: WindSpeed, wdir: WindDir}
    intermediate: true
  WindSpeedCheck:
    equation: "hypot(x, y)"
```

If an earlier rule produces no value for a record, because its inputs are missing, its equation
gave `None`, or it is disabled by a null constant, then no rule that uses its result fires either.
This makes a simple validity gate:

```
fields:
  valid:
    equation: "True if 0 <= Heading <= 360 else None"
    intermediate: true
  HeadingCorrected:
    equation: "(Heading + offset) % 360 if valid else None"
    constants: {offset: -0.8}
```

A name that matches a rule listed *after* the one using it reads the *record's* field of that name,
not the later rule's result. This is occasionally what you want (using a raw value that a later rule
replaces), but more often it's a rule in the wrong order, so the transform logs a warning about it
when it starts.

# Keeping or dropping fields

By default the transform returns the whole record with the computed fields added. Two options
control what else is kept:

| `delete_input_fields` | `delete_other_fields` | Result | Typical use |
|---|---|---|---|
| `false` | `false` | the record plus computed fields (default) | adding calibrated values to an inline data stream |
| `true` | `false` | computed fields replace their inputs; other fields kept | calibrating in place |
| `true` | `true` | computed fields only | reading from the CachedDataServer, computing, and writing back |
| `false` | `true` | computed fields and the inputs they used | |

`delete_input_fields` can also be set on an individual rule, overriding the transform-wide setting.

With `delete_other_fields: true`, a record that produces no computed value is dropped completely
rather than passed on. This matters for the CachedDataServer pattern: otherwise a record with nothing
to compute would be written back as though it were a derived result. It also makes the transform a
handy filter, as in the
[Sealog example]({{ "/cruise_records/#creating-sealog-events-from-logger-state-changes" | relative_url }}).

If a rule's name is the same as a field already in the record, the computed value overwrites it, and
a warning is logged.

If you want something in between, such as computed fields plus a timestamp field, follow the
transform with a `SelectFieldsTransform`.

# Combining instruments

When a rule's inputs come from different instruments, they arrive in different records. This
happens, for example, when correcting oxygen concentration using temperature and salinity from the
CTD. Three options handle this, and they mean the same as they do for `TrueWindsTransform`:

* **`cache_inputs: true`** - remember the latest value of each input field, so a rule can combine
  values from different records.
* **`update_on_fields: [Field, ...]`** - compute only when a record contains one of these fields.
  Without it, a new value is produced every time *any* input arrives, so a slow primary reading
  would be re-emitted each time the faster secondary one ticks.
* **`max_field_age: {Field: seconds, ...}`** - treat a remembered value older than this as missing,
  so a rule won't fire on stale data. Fields not listed never expire.

Setting either of the last two turns on `cache_inputs` automatically.

```
- class: ComputedFieldsTransform
  kwargs:
    update_on_fields: [SB_Oxygen_Concentration]      # recompute on each new O2 reading
    max_field_age:                                   # only trust CTD values < 2 s old
      SB_CTD_SBE49_WaterTemp: 2
      SB_CTD_SBE49_Salinity: 2
    delete_input_fields: true
    delete_other_fields: true
    fields:
      SB_Oxygen_Concentration_Corr:
        equation: "Conc * (1 + 0.032*(Temp - 20)) - 0.08*(Sal - 35)"
        inputs:
          Conc: SB_Oxygen_Concentration
          Temp: SB_CTD_SBE49_WaterTemp
          Sal: SB_CTD_SBE49_Salinity
```

## When a rule doesn't fire

A rule whose inputs aren't all available produces nothing for that record, and by default says
nothing about it. On a mixed stream that's the normal case. While setting things up, though,
"why isn't my field appearing?" is a common question, and these help:

* **`warn_missing_inputs: true`** logs a warning (once per rule and set of missing fields) naming
  which inputs were missing and why: not in the record, present but null, or a cached value that is
  too old.
* A debug message is always logged when *some* of a rule's inputs are present and others aren't,
  which usually means a misspelled field name. Run the logger with `listen` with `-v -v` to see it.

# Checking a configuration

Run `validate_config` on the cruise definition (or logger configuration file), from the OpenRVDAS
directory with its virtual environment active:

```
cd /opt/openrvdas
source venv/bin/activate
validate_config local/uuw/mvp/MVP2610_cruise.yaml
```

Besides checking the file's structure, `validate_config` expands a cruise definition as the logger
manager would, and builds every `ComputedFieldsTransform` and `InterpolationTransform` in it. A bad
equation is reported as an error naming the config and field:

```
  [ERROR] configs.tsg_cal-on.transforms[0]: ComputedFieldsTransform would fail when the logger
  starts: field "SeawaterTempCal": Attribute is not allowed in an equation. ...
```

It also reports any `<<variable>>` left over after expansion, which means a variable that is
misspelled or missing:

```
  [ERROR] configs.tsg_cal-on: unexpanded variable <<tsg_temp_slpoe>> (misspelled or missing?)
```

It can't catch a misspelled variable that has a default (`<<name|default>>`), because the default
is used and nothing is left over. If the definition can't be expanded on the machine where you run
the check, for example because it includes a file that only exists on the ship, these checks are
skipped.

To see exactly what a logger will do, run its config with `listen`, naming the config after a
colon:

```
listen --config_file local/uuw/mvp/MVP2610_cruise.yaml:tsg_cal-on
```

A bad equation fails immediately. A misspelled variable produces `Unexpanded variables found: ...`.
A rule disabled by a null constant logs `not computing "..." - constant(s) ... are null`. If the
config reads from the CachedDataServer and the system is running, you'll see computed values too.
Add `-v -v` to see why a rule isn't firing (see [When a rule doesn't fire](#when-a-rule-doesnt-fire)).
Stop it with Ctrl-C.

# Using the logger template

For the common case of one computed field per logger, reading from and writing back to the
CachedDataServer, `contrib/logger_templates/computed_fields_logger_template.yaml` saves writing out
the reader and writers each time. Include it, and fill in its variables:

```
includes:
  - contrib/logger_templates/computed_fields_logger_template.yaml

loggers:
  windsonic_dir_corr:
    logger_template: computed_fields_logger_template
    variables:
      output_field: Windsonic_WindDir_Corr
      equation: "(Windsonic_WindDir + zero_line_reference) % 360"
      constants:
        zero_line_reference: 180
      subscribe_fields:
        Windsonic_WindDir: {seconds: 0}
      measurement_name: windsonic
```

This produces configs `off`, `influx`, `influx_restricted`, `file` and `file+influx` for the
logger. The template expects the definition to set the variables `cdw_port`,
`influxdb_default_bucket`, `influxdb_restricted_bucket`, `header_dir`, `file_root` and `cruise`. Its
optional variables are `constants`, `inputs`, `update_on_fields`, `max_field_age`,
`warn_missing_inputs`, `header_file` and `file_suffix`. The comments at the top of the template have
more worked examples, and [Calibrated Values for Sensor Data]({{ "/cookbook/calibrated_values/" | relative_url }}) shows the template used
with coefficients from a calibration file. The template computes a single field, so for several
rules in sequence, such as the true winds below, write the logger config out in full.

# True winds

True wind is a good example of rules in sequence. It combines five inputs from three instruments,
and needs a validity check, vector arithmetic and some care with angles. OpenRVDAS has had a
dedicated `TrueWindsTransform` for a long time (see [Derived Data]({{ "/derived_data/" | relative_url }})).
The configuration below computes the same values with `ComputedFieldsTransform`, using the formulas
from `logger/utils/truewinds/truew.py`. OpenRVDAS's test suite checks that the two agree.

Why do it this way? Because every step is visible in the configuration, and can be changed there. You
can take the anemometer zero line from a [calibration file]({{ "/cookbook/calibrated_values/" | relative_url }}), use a different speed source, or
compute an apparent wind direction on the way. If you just want true winds and the standard
`TrueWindsTransform` suits you, use it.

## The calculation

The five inputs are course over ground and speed over ground (from the GPS), heading (from the
gyro), and wind direction and speed relative to the ship (from the anemometer).

1. **Check the inputs.** Course, heading and relative wind direction must be within 0-360, speeds
   must not be negative, and wind speed must not be 9999 (an old missing-value marker).
2. **Apparent wind direction** = (heading + relative wind direction + anemometer zero line) mod 360.
3. **The true wind's east and north components**, `x` and `y`: the apparent wind vector plus the
   ship's velocity vector. `270 - apparent` and `90 - course` turn compass bearings into the
   anticlockwise-from-east angles that `sin` and `cos` expect, and ship speed is converted from knots
   to m/s.
4. **True wind speed** = `hypot(x, y)`.
5. **True wind direction.** (`x`, `y`) points where the wind is blowing *to*. A wind direction says
   where it blows *from*, so the direction is the compass bearing of (`-x`, `-y`):
   `degrees(atan2(-x, -y)) % 360`. Following `truew()`, a calm wind is reported as 0, a wind with
   only a north-south component as exactly 180 or 360, and a direction within 0.0001° of north as
   360, the WMO convention.

## The logger

This reads the five inputs from the CachedDataServer and writes the results back. The anemometer
zero line, `port_anemometer_zero_line`, comes from the calibration file described in
[Calibrated Values for Sensor Data]({{ "/cookbook/calibrated_values/" | relative_url }}#the-files):

```
includes:
  - local/uuw/mvp/calibrations.yaml

loggers:
  true_winds_port:
    configs:
      'off': {}
      'on':
        readers:
          class: CachedDataReader
          kwargs:
            data_server: localhost:8766
            subscription:
              fields:
                S330CourseTrue: {seconds: 0}
                S330HeadingTrue: {seconds: 0}
                S330SpeedKt: {seconds: 0}
                MwxPortRelWindDir: {seconds: 0}
                MwxPortRelWindSpeed: {seconds: 0}

        transforms:
        - class: ComputedFieldsTransform
          kwargs:
            data_id: true_winds_port

            # The inputs arrive in separate records from different instruments,
            # so remember the latest of each, compute when a new wind direction
            # arrives, and don't use anything more than 15 seconds old.
            update_on_fields: [MwxPortRelWindDir]
            max_field_age:
              S330CourseTrue: 15
              S330HeadingTrue: 15
              S330SpeedKt: 15
              MwxPortRelWindDir: 15
              MwxPortRelWindSpeed: 15

            # Output only what we compute, not the raw inputs.
            delete_input_fields: true
            delete_other_fields: true
            metadata_interval: 10

            fields:
              valid:
                equation: "True if 0 <= crse <= 360 and 0 <= hd <= 360 and 0 <= wdir <= 360 and cspd >= 0 and wspd >= 0 and wspd != 9999 else None"
                inputs:
                  crse: S330CourseTrue       # course over ground, degrees true
                  cspd: S330SpeedKt          # speed over ground, knots
                  hd: S330HeadingTrue        # heading, degrees true
                  wdir: MwxPortRelWindDir    # wind direction relative to the bow
                  wspd: MwxPortRelWindSpeed  # wind speed relative to the ship, m/s
                intermediate: true

              PortApparentWindDir:
                equation: "(hd + wdir + zlr) % 360 if valid else None"
                inputs: {hd: S330HeadingTrue, wdir: MwxPortRelWindDir}
                constants:
                  zlr: <<port_anemometer_zero_line>>
                metadata: Apparent wind direction, degrees true (direction from)

              x:
                equation: "wspd * cos(radians(270 - PortApparentWindDir)) + cspd * knots_to_ms * cos(radians(90 - crse))"
                inputs: &components_inputs
                  wspd: MwxPortRelWindSpeed
                  cspd: S330SpeedKt
                  crse: S330CourseTrue
                constants: &components_constants
                  knots_to_ms: 0.5144
                intermediate: true

              y:
                equation: "wspd * sin(radians(270 - PortApparentWindDir)) + cspd * knots_to_ms * sin(radians(90 - crse))"
                inputs: *components_inputs
                constants: *components_constants
                intermediate: true

              PortTrueWindSpeed:
                equation: "hypot(x, y)"
                metadata: True wind speed, m/s

              PortTrueWindDir:
                equation: "0 if abs(x) <= 1e-5 and abs(y) <= 1e-5 else (180 if y > 0 else 360) if abs(x) <= 1e-5 else 360 if degrees(atan2(-x, -y)) % 360 < 0.0001 else degrees(atan2(-x, -y)) % 360"
                metadata: True wind direction, degrees true (direction from)

        writers:
          class: CachedDataWriter
          kwargs:
            data_server: localhost:8766
```

Things to notice:

* **`valid` gates everything.** It reads all five inputs, so it produces a value only when all five
  are present, fresh and sensible. `PortApparentWindDir` uses `valid`, and everything after it
  builds on `PortApparentWindDir`. If any check fails, no rule after it fires and nothing is output
  for that record.
* **The zero line comes from the calibration file.** If `port_anemometer_zero_line` is missing or
  misspelled, `validate_config` reports it. If the calibration file sets it to `null` (orientation
  unknown), `PortApparentWindDir` is disabled, so nothing downstream of it is computed. That is better
  than computing winds from an anemometer of unknown orientation.
* **`&components_inputs` and `*components_inputs`** are ordinary YAML anchors and aliases (see
  [A Short Introduction to YAML]({{ "/yaml/" | relative_url }})), used here so the shared inputs
  and constants of `x` and `y` are written once.
* **`x` and `y` are intermediate**, so only `PortApparentWindDir`, `PortTrueWindSpeed` and
  `PortTrueWindDir` are output.

The same configuration, without the calibration file, is in the OpenRVDAS repository as
[`test/configs/computed_true_winds.yaml`](https://github.com/OceanDataTools/openrvdas/blob/dev/test/configs/computed_true_winds.yaml).
With the NBP1406 sample cruise running in the logger manager, so that its parsed data is in the
CachedDataServer, you can try it directly:

```
listen --config_file test/configs/computed_true_winds.yaml
```

For a starboard anemometer, copy the logger, change the `Port`/`Mwx`/zero-line names, and use a
different `data_id`.

# Adding functions

The set of functions is deliberately small. To make more available, such as the TEOS-10 seawater
routines in the `gsw` package, subclass the transform in your own module and widen its `FUNCTIONS`
table:

```
# local/uuw/modules/gsw_computed_fields_transform.py
import gsw
from logger.transforms.computed_fields_transform import ComputedFieldsTransform

class GSWComputedFieldsTransform(ComputedFieldsTransform):
    FUNCTIONS = {**ComputedFieldsTransform.FUNCTIONS,
                 'gsw_z_from_p': gsw.z_from_p,
                 'gsw_SP_from_C': gsw.SP_from_C}
```

and use it with `module: local.uuw.modules.gsw_computed_fields_transform` (see
[Your Institution's Code and Configuration]({{ "/local_code/" | relative_url }}) for where such modules live). Names must be flat,
because an equation can't contain attribute access: `gsw_z_from_p(...)` works, `gsw.z_from_p(...)`
never can. The built-in functions all raise an error on bad input. Many `gsw` routines return NaN
instead, which would pass quietly into your data, so guard against that, e.g. with a rule that
checks the range of the result.

# Reference

## Transform options

| Option | Default | Meaning |
|---|---|---|
| `fields` | *(required)* | The rules: a dict keyed by the name of the field each produces. See below. |
| `delete_input_fields` | `false` | Drop the fields that equations read. See [Keeping or dropping fields](#keeping-or-dropping-fields). |
| `delete_other_fields` | `false` | Drop fields no equation read. A record that produces no computed value is dropped entirely. |
| `warn_missing_inputs` | `false` | Warn when a rule can't fire because inputs are missing. |
| `cache_inputs` | `false` | Remember each input's latest value across records. Implied by the next two. |
| `update_on_fields` | none | Compute only when a record contains one of these fields. |
| `max_field_age` | none | Field name → seconds. Cached values older than this count as missing. |
| `data_id` | none | `data_id` for the result, if the record doesn't have one. |
| `metadata_interval` | none | How often, in seconds, to attach the rules' `metadata` to output records. |
| `quiet` | `false` | Suppress warnings. |

## Rule options

| Option | Default | Meaning |
|---|---|---|
| `equation` | *(required)* | The expression to evaluate. |
| `constants` | `{}` | Names available to the equation. A `null` value disables the rule. |
| `inputs` | `{}` | Alias → field name. |
| `intermediate` | `false` | Make the result available to later rules, but don't output it. |
| `delete_input_fields` | transform's setting | Whether to drop the fields this rule read. |
| `metadata` | none | Description of the field, attached according to `metadata_interval`. |

## Resolving a name in an equation

A bare name in an equation is looked up in this order:

1. the rule's `constants`;
2. a built-in function, or `pi` or `e`;
3. an alias in the rule's `inputs`, which then stands for the field it names;
4. the result of an earlier rule of that name;
5. a field in the record (or, if caching, the latest remembered value of that field).

The source for the transform is
[`logger/transforms/computed_fields_transform.py`](https://github.com/OceanDataTools/openrvdas/blob/dev/logger/transforms/computed_fields_transform.py).
