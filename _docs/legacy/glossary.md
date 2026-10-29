---
permalink: /glossary/
title: "Glossary"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
**Device Type**
  - A make/model of sensor. A device type definition describes the expected data strings that this device type is expected to generate, how to parse them, and what to name each field (optionally includes a description and unit information).
  - Example: _Seapath330_, _Knudsen3260_.

**Device**
  - Vessel/Vehicle-specific instance of a device type, such as _seapath1_, _stbd_mast_vaisala_.
  - A device definition describes how to map the generic fields in the device type produces (_Heading_, _SpeedKts_, etc.) into names that uniquely identify the source instrument and data field (_S1Heading_, _S1SpeedKts_)
  - These unique names are used when writing values to InfluxDB and the Cached Data Server (CDS).

**Logger Module**
  - One of a number of software components that can be 'tacked together' in sequence to read, process, store and/or distribute sensor data. Modules are of one of three types:
  - **Readers** - OpenRVDAS object class for ingesting data from a data source (udp, serial, file, database, MMQT, modbus, etc). When called, a Reader returns either a record or a list of records.
  - **Transforms** - OpenRVDAS object class for modifying data from a reader or upstream transform. A transform receives records as input and outputs processed and/or filtered records.
  - **Writers** - OpenRVDAS object class for writing data records to a destination (udp, serial, file, database, etc).

**Logger Configuration**
  - An end-to-end definition logger modules that describes how to read, (optionally) transform, and write a sensor data stream. A logger configuration will include
    - one or more **Readers**. If there is more than one Reader (e.g. reading multiple UDP ports), they will read in parallel.
    - zero or more **Transforms**. Transforms are applied in series.
    - one or more **Writers**. If more than one Writer, they will write parallel.
  - A simple logger configuration might be:

    ```
    knud-net+file:
      readers:
      - class: SerialReader    # read a data string from serial port /dev/ttyr01
        kwargs:
          port: /dev/ttyr01
      transforms:
      - class: TimestampTransform  # prefix the data string with a timestamp
      - class: PrefixTransform     # prefix the timestamped string with 'knud'
          kwargs:
            prefix: knud
      writers:
      - class: UDPWriter      # write the prefixed, timestamped string to UDP 6224
        kwargs:
          port: 6224
      - class: LogfileWriter  # also write the prefixed, timestamped strings to file
        kwargs:
          filebase: /data/openrvdas/knud
    ```
  
**Logger**
  - The set of logger configurations defining the different logging behaviors required for a specific sensor (e.g. `knud-off`, `knud-net`, `knud-net+file`).

**Mode / Cruise Mode**
  - Typically, a vessel will have sets of logger configurations that should all be run together: which should be running when in port, when underway, etc.
  - Modes include a list of logger configurations to run.
  ```
    modes:
      'off':
        gyr1: gyr1-off
        s330: s330-off
        eng1: eng1-off
        knud: knud-off
        mwx1: mwx1-off
      port:
        gyr1: gyr1-net
        s330: s330-net
        eng1: eng1-net
        knud: knud-off
        mwx1: mwx1-net
      underway:
        gyr1: gyr1-net+file
        s330: s330-net+file
        eng1: eng1-net+file
        knud: knud-net+file
        mwx1: mwx1-net+file
  ```
**Composed Writer**
  - This is a special sub-class of the writer class that allows additional transform to be applied prior to a writer.

**kwargs**
  - This is how arguments are passed to reader, transform and writer classes. It's a Python thing.
