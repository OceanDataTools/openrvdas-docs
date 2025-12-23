---
permalink: /cookbook/calibrated_values/
title: "Calibrated Values for Sensor Data"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

This document describes how to apply calibration factors to raw sensor data to generate calibrated values.

The process is similar to other forms of derived data loggers: read the raw value, apply the appropriate transform, and write the transformed value back out to the appropriate location.

## Applying linear calibration factors
In the case of sensor calibrations that require a simple linear transform, this can be accomplished using a ModifyValueTransform:
```
readers:
- class: CachedDataReader
  kwargs:
    return_das_record: true
    data_id: calibrated
    data_server: localhost:8766
    subscription:
      fields: [RTmpValue]
transforms:
- class: ModifyValueTransform
  kwargs:
    fields:
      RTmpValue:
        mult_factor: 1.00223
        add_factor: 0.0442
        output_name: CalibratedRTmpValue
        delete_original: true
writers:
- class: CachedDataWriter
  kwargs:
    data_server: localhost:8766
```

The pattern for applying this transform is common enough that it has been encoded in  `calibration_logger_template.yaml` (in `contrib/logger_templates`) which pulls values from the cached data server, applies a ModifyValueTransform, then writes the calibrated values back to cached data server.

To use the template, create a file of calibration values in, e.g. `local/my_ship/calibration_files/calibrations-2025-04-15.yaml`:
```
# Calibration values for RTmpValue and SSpd
variables:
  # Rtmp calibration
  rtmp_field_name: RTmpValue
  rtmp_output_name: CalibratedRTmpValue
  rtmp_mult_factor: 1.00223
  rtmp_add_factor: 0.0442

  # SSpd calibration
  sspd_field_name: SSpd
  sspd_output_name: CalibratedSSpd
  sspd_mult_factor: 0.5443
  sspd_add_factor: 0
```

Define the loggers in your cruise definition file:
```
includes:
  local/my_ship/calibration_files/calibrations-2025-04-15.yaml

loggers:
  rtmp_cal:  # compute and write out calibrated values for rtmp
    logger_template: calibration_logger_template
    variables:
      field_name: rtmp_field_name
      output_name: rtmp_output_name
      mult_factor: rtmp_mult_factor
      add_factor: rtmp_add_factor

  sspd_cal:  # compute and write out calibrated values for sspd
    logger_template: calibration_logger_template
    variables:
      field_name: sspd_field_name
      output_name: sspd_output_name
      mult_factor: sspd_mult_factor
      add_factor: sspd_add_factor
```

When loaded, the template will expand to create logger configurations `rtmp_cal-off`, `sspd_cal-off`, `rtmp_cal-on` and `sspd_cal-on`, the latter two of which will generate and store calibrated values for `RTmp` and `SSpd` in the cached data server.

## More complex calibration factors

There has been discussion about expanding ModifyValueTransform to be able to perform more general modifications. There are substantial challenges for doing this safely and reliably. In the meantime, for more complex value modifications we recommend creation of a custom local transform derived from ModifyValueTransform, as described in the _Including Your Own Components_ section of [Logger Configuration Files]({{ "/logger_configuration_files/" | relative_url }})
