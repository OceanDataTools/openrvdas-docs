---
permalink: /nmea_device_types/
title: "NMEA Device Type Library"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

OpenRVDAS includes a comprehensive library of NMEA 0183 device type
definitions in
[logger/devices/NMEA\_0183.yaml](https://github.com/OceanDataTools/openrvdas/blob/master/logger/devices/NMEA_0183.yaml).
This file provides ready-to-use definitions for the most common marine
instrument categories, covering 13 device types with 108 format
patterns.

For background on how device types and parsing work, see
[Record Parsing]({{ "/parsing/" | relative_url }}).

# Available Device Types

| Device Type | Formats | Description |
|---|---|---|
| NMEA_GPS | 21 | Standard GPS/GNSS receiver — GGA, GLL, RMC, VTG, ZDA, GSA, GSV, GBS, GST, GNS, DTM, plus Garmin, Trimble, and u-blox proprietary sentences |
| NMEA_GPS_INS | 15 | Integrated GPS/INS (e.g., Seapath) — GPS sentences plus Kongsberg PSXN and Ashtech PASHR |
| NMEA_MRU | 16 | Standalone gyro/motion reference unit — HDT, HDM, HDG, ROT plus Kongsberg PSXN, Ashtech PASHR, True North PTNTHTM, Furuno PFEC, Kongsberg HiPAP PSIMSNS |
| NMEA_Depth | 10 | Depth/echo sounder — DBT, DPT, DBS, DBK plus Kongsberg KIDPT and Knudsen PKEL99/PKELalt |
| NMEA_Speed | 8 | Speed log/ADCP — VHW, VLW, VBW, VDR plus RD Instruments PRDID/PUHAW and Teledyne VDVBW |
| NMEA_Wind | 4 | Anemometer — MWV, MWD, VWR, VWT |
| NMEA_Meteo | 13 | Weather/oceanographic sensors — MDA, MTW, XDR, MTA, MHU, MMB plus Sea-Bird SBE45/SBE38/SBE48 |
| NMEA_Autopilot | 11 | Navigation/autopilot — APB, XTE, BOD, BWC, RMB, WPL, RTE, AAM |
| NMEA_Rudder | 1 | Rudder angle — RSA |
| NMEA_AIS | 2 | AIS transponder — AIVDM, AIVDO |
| NMEA_Radar | 4 | Radar/ARPA tracking — TTM, TLL, TLB, OSD |
| NMEA_USBL | 1 | Underwater positioning — Kongsberg HiPAP PSIMSSB |
| NMEA_Winch | 2 | Winch/wire monitoring — LCI90, WNC |

# Using NMEA Device Types

To use these built-in definitions, create a device definition that
references one of the NMEA device types and maps generic field names
to device-specific names. For example, to define a ``seap`` device
using the ``NMEA_GPS_INS`` type:

```
devices:
  seap:
    device_type: "NMEA_GPS_INS"
    serial_number: "S330-415-AX019G"
    description: "Seapath 330 on bridge"

    fields:
      GPSTime: "SeapGPSTime"
      Latitude: "SeapLatitude"
      Longitude: "SeapLongitude"
      NorS: "SeapNorS"
      EorW: "SeapEorW"
      FixQuality: "SeapFixQuality"
      NumSats: "SeapNumSats"
      HDOP: "SeapHDOP"
      AntennaHeight: "SeapAntennaHeight"
      HeadingTrue: "SeapHeadingTrue"
      CourseTrue: "SeapCourseTrue"
      SpeedKt: "SeapSpeedKt"
      GPSDay: "SeapGPSDay"
      GPSMonth: "SeapGPSMonth"
      GPSYear: "SeapGPSYear"
```

Then include the NMEA library in your definition file using the
``includes`` directive:

```
includes:
  - logger/devices/NMEA_0183.yaml
  - local/devices/*.yaml

devices:
  seap:
    device_type: "NMEA_GPS_INS"
    ...
```

The parser will load the ``NMEA_GPS_INS`` device type from the
included library and use its format patterns to parse incoming records
from the ``seap`` device.

# Organization by Category

The NMEA device types are organized by **functional category** rather
than by product model. For example, ``NMEA_GPS_INS`` covers any
integrated GPS/INS unit (Seapath, Hemisphere, etc.) rather than
defining separate types for each manufacturer's product.

This design has several advantages:

- **Fewer device types to manage** — one ``NMEA_GPS`` type covers all
  standard GPS receivers instead of one type per manufacturer
- **Broader sentence coverage** — each type includes all standard and
  common proprietary sentences for that instrument category
- **Simpler device definitions** — you only need to map the fields
  your specific instrument actually outputs

The trade-off is that a device type may include format patterns for
sentences your particular instrument never emits. This is harmless —
the parser simply never matches those patterns.

If you have an instrument that combines functions from multiple
categories (e.g., a weather station that also reports GPS position),
you can create a custom device type that includes the relevant
sentence patterns from multiple categories.

# Custom Device Types

If the built-in NMEA library doesn't cover your instrument, you can
create your own device type definitions. See the
[Devices and Device Types]({{ "/parsing/#devices-and-device-types" | relative_url }})
section of the Record Parsing documentation for the full YAML format,
and the [Adding a Sensor]({{ "/adding_a_sensor/" | relative_url }})
guide for a step-by-step walkthrough.

A custom device type definition follows the same structure:

```
device_types:
  MyCustomSensor:
    description: "Custom oceanographic sensor"
    format:
      DATA: "$MYSEN,{Temperature:of},{Salinity:of},{Depth:of}*{CheckSum:x}"
    fields:
      Temperature:
        units: "degrees C"
        description: "Water temperature"
      Salinity:
        units: "PSU"
        description: "Practical salinity"
      Depth:
        units: "meters"
        description: "Sensor depth"
```

# Contributing

Community-contributed device definitions are welcome in the
[contrib/devices/](https://github.com/OceanDataTools/openrvdas/tree/master/contrib/devices)
directory. If you have device type definitions for instruments not
covered by the built-in library, consider contributing them to help
other users.
