---
permalink: /cookbook/calibrated_values/
title: "Calibrated Values for Sensor Data"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
This page describes how to apply calibration coefficients to raw sensor data to produce calibrated
values, keeping the coefficients in dated, version-controlled calibration files that can be updated
without touching the cruise definition.

The calibrations themselves are computed by `ComputedFieldsTransform`, which handles calibrations of
any form: linear, polynomial, conditional, or drawing on several instruments. This page covers what
is specific to calibrations. For how the transform works (writing equations, constants, rules in
sequence, which fields are kept), see
[Computed Fields: ComputedFieldsTransform]({{ "/computed_fields/" | relative_url }}).

> **Version note:** `ComputedFieldsTransform` is new in OpenRVDAS v2.7.0. For earlier versions, see
> [ModifyValueTransform](#the-older-approach-modifyvaluetransform) below.

# The approach

Calibration coefficients change more often than the processing that uses them, and they need a
clear history: which coefficients were in use on which dates. A good way to manage them is:

* keep each set of coefficients in its own **dated file**, under source control in your ship's
  `local/` repository;
* point a fixed name, `calibrations.yaml`, at the current one with a **symbolic link**;
* have the cruise definition **include** `calibrations.yaml` and refer to the coefficients as
  **variables**.

Updating a calibration then means adding a new dated file and moving the link. The cruise
definition doesn't change.

# The files

The calibration files belong in your institution's own repository, symlinked into OpenRVDAS's `local/`
directory as described in [Your Institution's Code and Configuration]({{ "/local_code/" | relative_url }}). Here, that repository
is checked out at `/opt/openrvdas_uuw` and linked as `local/uuw`, with a directory `mvp` for the
vessel:

```
local/uuw/mvp/
  calibrations-2026-04-15.yaml        previous coefficients, kept for the record
  calibrations-2026-10-01.yaml        current coefficients
  calibrations.yaml -> calibrations-2026-10-01.yaml
  MVP2610_cruise.yaml                 cruise definition
```

The dated file defines the coefficients as variables:

```
# calibrations-2026-10-01.yaml
# Coefficients from the October 2026 shipyard calibrations.
# Sheets are in the ship's calibration binder and on the science share under Calibrations/2026-10.

variables:
  # SBE45 TSG temperature, s/n 4521, calibrated 2026-09-12
  tsg_temp_slope: 1.00021
  tsg_temp_offset: -0.0032

  # WET Labs ECO fluorometer, s/n 3381: Chl (ug/l) = scale * (counts - dark)
  fluoro_scale: 0.0123
  fluoro_dark: 48

  # Paroscientific barometer, quadratic correction
  baro_a0: -0.12
  baro_a1: 0.998
  baro_a2: 1.0e-5

  # Biospherical PAR sensor: not yet calibrated after replacement
  par_scale: null

  # Port anemometer zero line, degrees clockwise from the bow
  port_anemometer_zero_line: 0.0
```

Make the link, and commit both the dated file and the link, so the repository records which file was
current when:

```
cd /opt/openrvdas/local/uuw/mvp
ln -s calibrations-2026-10-01.yaml calibrations.yaml
git add calibrations-2026-10-01.yaml calibrations.yaml
git commit -m "Calibrations from October 2026 shipyard period"
```

Use a relative link target (just the file name, as above), so the link still works when the
repository is checked out somewhere else.

# Using the coefficients

The cruise definition includes the link, and uses the variables as the constants of
`ComputedFieldsTransform` rules:

```
includes:
  - local/uuw/mvp/calibrations.yaml

loggers:
  tsg_cal:
    configs:
      'off': {}
      'on':
        readers:
          class: CachedDataReader
          kwargs:
            data_server: localhost:8766
            subscription:
              fields:
                SeawaterTemp: {seconds: 0}
                FluoroCounts: {seconds: 0}
                PARRaw: {seconds: 0}
        transforms:
        - class: ComputedFieldsTransform
          kwargs:
            delete_input_fields: true
            delete_other_fields: true
            fields:
              SeawaterTempCal:
                equation: "slope * SeawaterTemp + offset"
                constants:
                  slope: <<tsg_temp_slope>>
                  offset: <<tsg_temp_offset>>
              ChlCal:
                equation: "scale * (FluoroCounts - dark)"
                constants:
                  scale: <<fluoro_scale>>
                  dark: <<fluoro_dark>>
              PARCal:
                equation: "scale * PARRaw"
                constants:
                  scale: <<par_scale>>
        writers:
          class: CachedDataWriter
          kwargs:
            data_server: localhost:8766
```

This logger reads the raw values from the CachedDataServer and writes only the calibrated values
back. That's what `delete_input_fields` and `delete_other_fields` do: see
[Keeping or dropping fields]({{ "/computed_fields/#keeping-or-dropping-fields" | relative_url }}).

How this fits together:

* **Paths in `includes` are relative to the OpenRVDAS directory** (e.g. `/opt/openrvdas`), not to
  the file doing the including.
* **The included file's `variables` are merged with the definition's own.** If the cruise definition
  also defines a variable with the same name, the definition's value wins, so don't define
  calibration variables anywhere else. Variables are shared across the whole definition, so give
  them names that say which instrument they belong to.
* **A variable used on its own, like `slope: <<tsg_temp_slope>>`, keeps its type.** The constant
  is the number `1.00021`, not the string `"1.00021"`.
* **`par_scale: null` disables the `PARCal` rule**, and nothing else. A constant whose value is
  `null` disables its rule (see
  [Constants]({{ "/computed_fields/#constants" | relative_url }})), so the temperature and
  chlorophyll rules carry on. When the sensor is calibrated, put the coefficient in a new dated file.

## Don't give calibration variables defaults

A variable reference can give a default, used when the variable isn't defined:
`<<tsg_temp_slope|1.0>>`. **Don't use defaults for calibration coefficients.** Write
`<<tsg_temp_slope>>`, and put every coefficient in the calibration file, with `null` for a sensor
that isn't calibrated (like `par_scale` above).

A default hides mistakes. If the coefficient is misspelled or missing from the calibration file,
the default is used and nothing is reported:

* `<<tsg_temp_slope|1.0>>` silently publishes uncalibrated readings under a name that says they
  are calibrated;
* `<<tsg_temp_slope|null>>` is safer, but it silently disables the rule, so a calibrated field
  simply stops appearing.

Without a default, a misspelled or missing variable is left in the expanded definition as the
literal text `<<tsg_temp_slope>>`, and that *is* reported: [`validate_config`](#checking-before-you-sail)
reports it as an error, and the logger manager logs `Unexpanded variables found: <<tsg_temp_slope>>`
when the definition is loaded.

## One calibrated field per logger: the template

If you'd rather have a logger per calibrated field, `computed_fields_logger_template` saves writing
out the reader and writers each time (see
[Using the logger template]({{ "/computed_fields/#using-the-logger-template" | relative_url }}) for
the variables it takes and expects):

```
includes:
  - contrib/logger_templates/computed_fields_logger_template.yaml
  - local/uuw/mvp/calibrations.yaml

loggers:
  baro_cal:
    logger_template: computed_fields_logger_template
    variables:
      output_field: BaroPressureCal
      equation: "a2 * P**2 + a1 * P + a0"
      inputs: {P: BaroPressure}
      constants:
        a0: <<baro_a0>>
        a1: <<baro_a1>>
        a2: <<baro_a2>>
      subscribe_fields:
        BaroPressure: {seconds: 0}
      measurement_name: baro
```

## Coefficients in other calculations

A calibration file can hold any per-instrument constant, not just slopes and offsets. The
[true winds example]({{ "/computed_fields/#true-winds" | relative_url }}) takes its anemometer zero
line from `port_anemometer_zero_line` in the file above.

# Checking before you sail

Run `validate_config` on the cruise definition, from the OpenRVDAS directory with its virtual
environment active:

```
cd /opt/openrvdas
source venv/bin/activate
validate_config local/uuw/mvp/MVP2610_cruise.yaml
```

It expands the definition, including the calibration file, as the logger manager would, and
reports any `<<variable>>` left over afterwards: a coefficient that is misspelled, or missing from
the calibration file:

```
  [ERROR] configs.tsg_cal-on: unexpanded variable <<tsg_temp_slpoe>> (misspelled or missing?)
```

It can't catch a misspelled variable that has a default, because the default is used and nothing
is left over. That's one more reason to
[leave defaults off calibration variables](#dont-give-calibration-variables-defaults). It also
checks the equations themselves; see
[Checking a configuration]({{ "/computed_fields/#checking-a-configuration" | relative_url }}).

To see the calibrated values a logger will produce, run its config with `listen`, naming the
config after a colon:

```
listen --config_file local/uuw/mvp/MVP2610_cruise.yaml:tsg_cal-on
```

A disabled rule logs `not computing "PARCal" - constant(s) scale are null`. If the system is
running, you'll see calibrated values printed as they're computed. Stop it with Ctrl-C.

# Updating a calibration

When new coefficients arrive:

1. **Make a new dated file.** Copy the current one, update the values and the comment saying where
   they came from, and commit it:

   ```
   cd /opt/openrvdas/local/uuw/mvp
   cp calibrations-2026-10-01.yaml calibrations-2026-11-15.yaml
   vi calibrations-2026-11-15.yaml
   git add calibrations-2026-11-15.yaml
   git commit -m "TSG temperature recalibration, s/n 4521"
   ```

2. **Move the link, and commit that too:**

   ```
   ln -sfn calibrations-2026-11-15.yaml calibrations.yaml
   git commit -am "Use calibrations from 2026-11-15"
   ```

3. **Check it**, as [above](#checking-before-you-sail).

4. **Reload the cruise definition** in the web console. Moving the link changes nothing until you
   do: running loggers keep the coefficients they started with. On reload, the logger manager
   restarts just the loggers whose configs have changed, with the new coefficients.

If the logger manager is [taking automatic snapshots]({{ "/cruise_records/#automatic-snapshots" | relative_url }}),
it takes one when the link moves and another when the definition is reloaded. If you snapshot after
moving the link but before reloading, the snapshot warns that the running loggers don't match the
definition. That's a useful check that the reload actually happened.

> **Tip:** a snapshot captures `calibrations.yaml` under that name, with the contents of whichever
> dated file it pointed to, and its manifest entry records that file's name as `resolves_to`. A comment at the top of each dated file still helps, because it makes the copy in
> the snapshot self-explanatory. See
> [A note on symlinked files]({{ "/cruise_records/#a-note-on-symlinked-files" | relative_url }}).

# The older approach: ModifyValueTransform

Before v2.7.0, linear calibrations were applied with `ModifyValueTransform`, usually through
`contrib/logger_templates/calibration_logger_template.yaml`, which takes a field name, an output
name, and multiplicative and additive factors. Both still work, and the comments at the top of the
template show how to use it with a calibration file. For anything new, `ComputedFieldsTransform` is
the more general choice.
