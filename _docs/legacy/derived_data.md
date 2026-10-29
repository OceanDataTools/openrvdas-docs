---
permalink: /derived_data/
title: "Derived Data Loggers"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
A typical logger will receive its raw data via a serial port, or a network attached sensor. But many ships rely on derived values as well, e.g. combining relative wind speed and direction with vessel heading, course and speed to compute a true wind speed and direction.

The recommended way of achieving this with OpenRVDAS is with derived data loggers. Typically, a derived data logger will take values from, say, a cached data server, compute new values, and output them back to the same cached data server. To implement the true wind example above, we retrieve the desired values and feed them into a [TrueWindsTransform](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/true_winds_transform.py), a subclass of the generic [DerivedDataTransform](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/derived_data_transform.py):

```
  true_wind->on:
    name: true_wind->on
    # Get values we need from cached data server
    readers:
      class: CachedDataReader
      kwargs:
        data_server: localhost:8766
        subscription:
          fields:
            S330CourseTrue:
              seconds: 0
            S330HeadingTrue:
              seconds: 0
            S330SpeedKt:
              seconds: 0
            MwxPortRelWindDir:
              seconds: 0
            MwxPortRelWindSpeed:
              seconds: 0
            
    transforms:
    - class: TrueWindsTransform
      kwargs:
        wind_dir_field: MwxPortRelWindDir     # What field to use for wind dir
        wind_speed_field: MwxPortRelWindSpeed # "       "       "     wind speed
        course_field: S330CourseTrue          # "       "       "     ship course
        heading_field: S330HeadingTrue        # "       "       "     ship heading
        speed_field: S330SpeedKt              # "       "       "     ship speed

        convert_speed_factor: 0.5144          # Convert ship speed from kt to m/s
        update_on_fields:                     # Output new value when we get an
        - MwxPortRelWindDir                   # update from one of these fields

        apparent_dir_name: PortApparentWindDir  # What to call the apparent wind output
        true_dir_name: PortTrueWindDir          # "       "     "  true wind dir output
        true_speed_name: PortTrueWindSpeed      # "       "     "  true wind speed output

    # Send output back to cached data server
    writers:
    - class: CachedDataWriter
      kwargs:
        data_server: localhost:8766
```

The other widely-useful derived data transform that is available is the InterpolationTransform. One may want to plot a smoothed version of a noisy data stream, or save a compact 10-minute snapshot average. The InterpolationTransform is designed specifically for this.

```
  snapshot->on:   
    # Request the fields we want from cached data server
    readers:
      class: CachedDataReader
      kwargs:
        data_server: localhost:8766
        subscription:
          fields:
            PortTrueWindDir:
              seconds: 0
            PortTrueWindSpeed:
              seconds: 0
            StbdTrueWindDir:
              seconds: 0
            StbdTrueWindSpeed:
              seconds: 0

    # For each field we're interpolating, key is the variable we're creating,
    # and value a dict of the source variable and how we're performing the
    # interpolation.
    transforms:
    - class: InterpolationTransform
      kwargs:
        interval: 10           # Output averages every 10 seconds
        window: 10             # Keep 10 seconds of data to average over
        metadata_interval: 20  # Send metadata every 20 seconds
        field_spec:
          AvgPortTrueWindDir:              # What to call the interpolated output
            source: PortTrueWindDir        # What field to interpolate
            algorithm:
              type: polar_average       # Average as an angle, so 359 and 1 give 0
              window: 10                # Use a window 10 seconds wide
          AvgPortTrueWindSpeed:
            source: PortTrueWindSpeed
            algorithm:
              type: boxcar_average
              window: 10
          AvgStbdTrueWindDir:
            source: StbdTrueWindDir
            algorithm:
              type: polar_average
              window: 10
          AvgStbdTrueWindSpeed:
            source: StbdTrueWindSpeed
            algorithm:
              type: boxcar_average
              window: 10

    # Write results back to the cached data server
    writers:
    - class: CachedDataWriter
      kwargs:
        data_server: localhost:8766        
```

The value associated with the 'algorithm' key should be a dict that will be passed to the interpolate() method of InterpolationTransform. As of v2.7.0 there are many algorithms besides 'boxcar_average', 'nearest' and 'polar_average', including medians, weighted averages and window statistics for quality control; see [Averaging and Resampling: InterpolationTransform]({{ "/interpolation_transform/" | relative_url }}) for the full list and their options.

For derived values that are formulas rather than averages, such as unit conversions or true winds computed step by step, see [Computed Fields: ComputedFieldsTransform]({{ "/computed_fields/" | relative_url }}). For calibrations in particular, see [Calibrated Values for Sensor Data]({{ "/cookbook/calibrated_values/" | relative_url }}).
