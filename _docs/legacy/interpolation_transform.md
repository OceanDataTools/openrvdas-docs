---
permalink: /interpolation_transform/
title: "Averaging and Resampling: InterpolationTransform"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
Instruments report at their own rates. The GPS might send 1 Hz, the met station every 2 seconds, the
TSG every 5 seconds, and none of them on the same second. `InterpolationTransform` takes these
irregular, timestamped readings and produces values at regular times: an average, median or other
statistic of each field over a window centred on each output time. Typical uses are:

* one-minute (or 30-second, or 10-minute) averages for a cruise summary file or a "snapshot" display;
* resampling several instruments onto a common time base so their values line up;
* quality-control statistics alongside the averages: how many readings there were, and how much they
  varied;
* smoothing a noisy signal for display.

This page covers how the transform works, then the algorithms it offers, then some recipes.

> **Version note:** OpenRVDAS v2.7.0 added most of
> the algorithms below: `median`, `trimmed_mean`, `time_weighted_average`, `gaussian_average`,
> `triangular_average`, `exponential_average` and the window statistics. It also added the
> `min_count`, `outlier_mads` and `trim` options, made every algorithm ignore missing values, and
> added `averaging_logger_template`. Earlier versions have only `boxcar_average`, `polar_average`
> and `nearest`.

# A first example

The simplest way to get averages is the `averaging_logger_template`. It reads fields from the
CachedDataServer, averages them, and writes the averages back, each with an `Avg` prefix:

```
includes:
  - contrib/logger_templates/averaging_logger_template.yaml

variables:
  data_server: localhost:8766
  influx_bucket_name: openrvdas

loggers:
  met_avg:
    logger_template: averaging_logger_template
    variables:
      snapshot_fields: [AirTemp, BaroPressure, WindSpeed, WindDir]
      average_fields: [AirTemp, BaroPressure, WindSpeed]
      direction_fields: [WindDir]
      interval: 60
      window: 60
```

Every 60 seconds, this writes `AvgAirTemp`, `AvgBaroPressure`, `AvgWindSpeed` and `AvgWindDir` to
the CachedDataServer, each averaged over 60 seconds of data. `WindDir` is listed under
`direction_fields`, so it's averaged as an angle, and readings of 359° and 1° average to 0°, not
180°. `snapshot_fields` must list every field: the template can't join the other two lists itself.
Use `direction_fields: []` if there are none.

The template has two configs: `on`, which writes back to the CachedDataServer, and `on+influx`, which
also writes to InfluxDB (to the bucket named by the `influx_bucket_name` variable).

The template uses this transform:

```
- class: InterpolationTransform
  kwargs:
    interval: 60
    window: 60
    data_id: met_avg
    field_spec:
    - sources: [AirTemp, BaroPressure, WindSpeed]
      algorithm: boxcar_average
      window: 60
      result_prefix: Avg
    - sources: [WindDir]
      algorithm: polar_average
      window: 60
      result_prefix: Avg
```

For anything beyond plain averages, such as medians, minimum reading counts or QC statistics, write
the logger out like this and adjust the `field_spec`.

`averaging_logger_template` replaces the older `snapshot_logger_template`, which averaged a fixed
list of N.B. Palmer field names. The old template is still there for existing definitions.

# How it works

## Output times

The transform keeps the recent readings of each source field it's interested in. Its first output
time is the timestamp of the first record it sees. After that, it produces one output every
`interval` seconds.

The value for an output time *t* is computed from the readings within the algorithm's window around
*t*, from *t* − window/2 to *t* + window/2. So it can't be computed until readings from after
*t* + window/2 have arrived. The transform produces the output for *t* as soon as it receives a
record timestamped later than that.

Three consequences:

* **Outputs lag behind real time by half the window**, plus up to one input interval. A 60-second
  average centred on 12:00:00 appears at about 12:00:30.
* **Output times are not aligned to the clock.** If the first record arrives at 12:00:07.3, outputs
  are at 12:00:07.3, 12:01:07.3, and so on. Each output is timestamped with its output time *t*, not
  with the time it was produced.
* **The first output's window is only half full**, because there was no data before the first record.
  Use [`min_count`](#min_count) if that matters.

Here is a 10-second average at 5-second intervals, fed with one reading a second starting at
t = 1000.5. The first output appears when the record for t = 1006.5 arrives. It is timestamped 1000.5
and averages the six readings from 1000.5 to 1005.5:

```
in t=1006.5 -> {'timestamp': 1000.5, 'fields': {'AvgT': 11,   'NT': 6}}
in t=1011.5 -> {'timestamp': 1005.5, 'fields': {'AvgT': 10.9, 'NT': 10}}
in t=1016.5 -> {'timestamp': 1010.5, 'fields': {'AvgT': 11,   'NT': 10}}
```

(`NT` is a [`count`](#window-statistics) of the readings in each window. The second window holds
eleven timestamps, but one reading was NaN, so its count is 10.)

## Two windows

The transform has a `window`, and so does each algorithm. They do different jobs:

* the **transform's `window`** sets how long readings are kept, and so how long outputs are delayed;
* each **algorithm's `window`** sets which readings that algorithm uses. It defaults to 10 seconds if
  not given.

Readings older than half the transform's window before the current output time are discarded. So an
algorithm's window should be **no larger than the transform's**, or the older part of it will be
empty. The usual setup is to make them the same, as the template does. A transform's window larger
than any algorithm's only adds delay.

## Input and output

The transform accepts DASRecords, or dicts with `timestamp` and `fields` keys. Records without a
timestamp are ignored with a warning. Fields it isn't interested in are ignored, so it can sit on a
stream carrying anything.

Each call returns a **list** of output records, each a dict like

```
{'timestamp': 1792790460.0, 'data_id': 'met_avg',
 'fields': {'AvgAirTemp': 14.2, 'AvgWindDir': 271.5}}
```

The list is empty if no output time has been completed, and may hold several records if a gap in
the input completed several at once. `data_id` is included only if one was set. An output time for
which no field has a value produces no record at all. Writers and later transforms handle lists of
records, so nothing special is needed downstream.

# Specifying fields

`field_spec` says which fields to compute, from which source fields, and how. It takes two forms.

**As a dict**, keyed by the output field's name. This gives full control over names:

```
field_spec:
  AirTemp1min:
    source: AirTemp
    algorithm: {type: boxcar_average, window: 60}
  WindDir1min:
    source: WindDir
    algorithm: {type: polar_average, window: 60}
  AirTemp1minN:
    source: AirTemp
    algorithm: {type: count, window: 60}
```

**As a list** of groups, each applying one algorithm to several source fields and naming the outputs
by adding a prefix. This form is easier to use from a template:

```
field_spec:
- sources: [AirTemp, BaroPressure, WindSpeed]
  algorithm: boxcar_average
  window: 60
  result_prefix: Avg              # -> AvgAirTemp, AvgBaroPressure, AvgWindSpeed
  min_count: 20                   # any other keys are options for the algorithm
- sources: [AirTemp, BaroPressure, WindSpeed]
  algorithm: std_dev
  window: 60
  result_prefix: StdDev           # -> StdDevAirTemp, ...
```

To output several statistics of the same field, list it once for each, with a different
`result_prefix`.

# Algorithms

## Averages

| Algorithm | What it computes | Use it for |
|---|---|---|
| `boxcar_average` | the mean of the readings in the window | the default for most scalar fields |
| `polar_average` | the mean direction of angles in degrees (the direction of the mean unit vector) | headings, wind directions, any angle that wraps at 360 |
| `nearest` | the reading closest in time to the output time | resampling values that shouldn't be averaged: counters, flags, strings, GPS day |
| `median` | the median of the readings in the window | sensors prone to occasional spikes or dropouts |
| `trimmed_mean` | the mean after dropping the highest and lowest fraction `trim` (default 0.1) from each end | spiky data where you still want a mean |
| `time_weighted_average` | the mean with each reading weighted by the time it covers, integrating linearly between readings | irregular data, where a burst of readings or a gap would skew a plain mean |
| `gaussian_average` | readings weighted by exp(−dt²/2σ²), dt being their distance from the output time; `sigma` defaults to window/6 | smooth curves: unlike a boxcar, it doesn't jump as readings enter or leave the window |
| `triangular_average` | readings weighted from 1 at the output time down to 0 at the window's edges | similar to `gaussian_average`, and simpler |
| `exponential_average` | an exponential moving average with `time_constant` seconds (required) | smoothing for display; see below |

A few notes:

* `polar_average` averages direction only. Each reading counts the same, whatever the wind speed. For
  a true vector-average wind, compute the east and north components with a
  [`ComputedFieldsTransform`]({{ "/computed_fields/" | relative_url }}), average each with
  `boxcar_average`, and recombine them with another `ComputedFieldsTransform`.
* `exponential_average` works differently from the others. It uses only readings up to the output
  time, and it carries its average forward from one output to the next, so its time constant can be
  longer than the window. Each new reading moves the average `1 − exp(−dt/time_constant)` of the
  way towards it, dt being the time since the previous reading. Its outputs are still delayed by half
  the transform's window, like every output. So for a live display, give it a transform of its own
  with a short window, but no shorter than twice the interval, or readings may be discarded before
  it sees them. It stops producing values once the field's latest reading is more than a window old.

## Window statistics

These report on the readings in each window. They are mainly for quality control.

| Algorithm | What it computes |
|---|---|
| `min`, `max` | the smallest and largest reading in the window |
| `std_dev` | the sample standard deviation; needs at least two readings |
| `circular_std_dev` | the standard deviation of angles in degrees (Yamartino method), so readings either side of 0/360 count as close together |
| `count` | how many valid readings the window holds: 0, rather than no value, when it holds none |

A low `count` flags an instrument that has gone quiet. A `std_dev` of zero over a long window flags
one that is stuck.

## Missing values

Every algorithm ignores missing values: `None`, and NaN, which some instruments send when they have
no reading. One bad reading doesn't turn a whole average into NaN. If a window holds nothing but
missing values, no value is output for it (except `count`, which outputs 0).

# Options

Options go in the algorithm's dict (dict form), or alongside `algorithm` (list form).

## min_count

`min_count` (default 1): output no value for a window holding fewer than this many valid readings,
rather than reporting the average of one or two readings as if the window were full. This avoids
misleading values at start-up and around data gaps. For a 1 Hz sensor averaged over 60 seconds,
`min_count: 45` is a reasonable choice. `min_count` counts readings before outliers are dropped.

Allowed with every algorithm except `nearest`, `count` and `exponential_average`.

## outlier_mads

`outlier_mads`: before computing, drop readings more than this many median absolute deviations
(MADs) from the window's median. It must be at least 1, so at least half the window is always kept;
3 is a common choice. If more than half the readings in a window are identical, the MAD is zero, and
any reading that differs from them is dropped.

Allowed with `boxcar_average`, `median`, `trimmed_mean`, `min`, `max` and `std_dev`.

## Algorithm-specific options

| Option | Algorithm | Meaning |
|---|---|---|
| `trim` | `trimmed_mean` | Fraction dropped from each end, at least 0 and less than 0.5 (default 0.1). |
| `sigma` | `gaussian_average` | Width of the Gaussian in seconds (default: a sixth of the window, so the window spans 3σ either side). |
| `time_constant` | `exponential_average` | Time constant in seconds. Required. |

The transform checks these when the logger starts, and `validate_config` checks them before
that. Giving `outlier_mads`, `trim`, `sigma` or
`time_constant` to an algorithm that doesn't take it, `min_count` to `count` or
`exponential_average`, or an invalid value to any of them, stops the logger with an error naming the
field and the problem. (`min_count` given to `nearest` is ignored.)

# Recipes

## One-minute met averages with QC statistics

Averages, standard deviations and counts for the met sensors, with the wind direction averaged as
an angle, and nothing reported for a minute with fewer than 45 readings:

```
transforms:
- class: InterpolationTransform
  kwargs:
    interval: 60
    window: 60
    data_id: met_1min
    field_spec:
    - sources: [AirTemp, RelHumidity, BaroPressure, WindSpeed]
      algorithm: boxcar_average
      window: 60
      min_count: 45
      result_prefix: Avg
    - sources: [AirTemp, RelHumidity, BaroPressure, WindSpeed]
      algorithm: std_dev
      window: 60
      result_prefix: StdDev
    - sources: [WindSpeed]
      algorithm: count
      window: 60
      result_prefix: N
    - sources: [WindDir]
      algorithm: polar_average
      window: 60
      min_count: 45
      result_prefix: Avg
    - sources: [WindDir]
      algorithm: circular_std_dev
      window: 60
      result_prefix: StdDev
```

## A spiky sensor

For a sensor that occasionally reports wild values, use a median, or a mean with outliers dropped:

```
field_spec:
  FlowRate1min:
    source: FlowRate
    algorithm: {type: boxcar_average, window: 60, outlier_mads: 3, min_count: 30}
```

## Wind gusts

The WMO definition of a gust is the maximum 3-second average wind speed. That takes two stages: a
3-second running average at 1-second intervals, then the maximum of that over the reporting period.
Two transforms in the same logger do it, the second reading the first's output:

```
transforms:
- class: InterpolationTransform          # 3-second running average
  kwargs:
    interval: 1
    window: 3
    field_spec:
      WindSpeed3s:
        source: WindSpeed
        algorithm: {type: boxcar_average, window: 3}
- class: InterpolationTransform          # 10-minute mean and gust
  kwargs:
    interval: 600
    window: 600
    data_id: wind_10min
    field_spec:
      WindSpeed10min:
        source: WindSpeed3s
        algorithm: {type: boxcar_average, window: 600}
      WindGust10min:
        source: WindSpeed3s
        algorithm: {type: max, window: 600}
```

## Smoothing for a display

A heavily smoothed value that updates every second, for a display. The time constant can be longer
than the window, because the exponential average carries over from one output to the next:

```
- class: InterpolationTransform
  kwargs:
    interval: 1
    window: 4
    field_spec:
      HeadingSmoothed:
        source: GyroHeading
        algorithm: {type: exponential_average, window: 4, time_constant: 30}
```

Don't use this for headings that cross north: the exponential average, like every algorithm here
except `polar_average` and `circular_std_dev`, treats values as plain numbers, so 359° and 1° average
to 180°.

# Reference

## Transform options

| Option | Default | Meaning |
|---|---|---|
| `field_spec` | *(required)* | The fields to compute, as a dict or a list. See [Specifying fields](#specifying-fields). |
| `interval` | *(required)* | Seconds between output times. |
| `window` | *(required)* | Seconds of readings to keep. Outputs are delayed by half of this. |
| `data_id` | none | `data_id` to give output records. |

## Algorithm options

| Option | Default | Used by |
|---|---|---|
| `type` | *(required)* | (dict form) the algorithm's name; in list form, `algorithm:` |
| `window` | 10 | all: seconds of readings, centred on the output time |
| `min_count` | 1 | all except `nearest`, `count`, `exponential_average` |
| `outlier_mads` | none | `boxcar_average`, `median`, `trimmed_mean`, `min`, `max`, `std_dev` |
| `trim` | 0.1 | `trimmed_mean` |
| `sigma` | window/6 | `gaussian_average` |
| `time_constant` | *(required)* | `exponential_average` |

The source for the transform is
[`logger/transforms/interpolation_transform.py`](https://github.com/OceanDataTools/openrvdas/blob/dev/logger/transforms/interpolation_transform.py),
and the template is
[`contrib/logger_templates/averaging_logger_template.yaml`](https://github.com/OceanDataTools/openrvdas/blob/dev/contrib/logger_templates/averaging_logger_template.yaml).
