---
permalink: /cruise_definition_files/
title: "Cruise Definition Files"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

## Overview

Please see the [Introduction to OpenRVDAS Loggers]({{ "/intro_to_loggers/" | relative_url }}) and 
[Logger Configurations Files]({{ "/logger_configuration_files/" | relative_url }}) for a general introduction to loggers and their configuration files.

## Cruise Definitions

A typical cruise will involve many loggers running in parallel, typically one for each sensor. Additionally, each logger may need to run one of several different configurations depending on the phase of the cruise (such as "in port", "in EEZ" or "underway"). An OpenRVDAS _cruise definition file_ specifies all of these configurations, associates them with specific loggers, and allows creating "modes" such as `port`, `EEZ`, `underway`, etc, to support different phases of ship operation.

It is this cruise definition file that is loaded by the OpenRVDAS GUI, or by the Logger Manager when run from the command line.

## Components of a Cruise Definition File

Cruise definition files are YAML-format dictionaries with a few couple of top-level keys:
- `loggers` - the entries under this key define which loggers exist and specify what logger configurations are associated with each of them.
- `configs` - in a fully-expanded (we'll explain what this means later) cruise definition file, the actual configurations associated with the loggers are defined.

If not present, two more keys will be auto-populated.
- `modes` - entries under this key define groups of logger configurations that should be run together in specific situations, or phases of a cruise, e.g. "in port", "EEZ", or "underway". If not present, a default mode will be created using the first config declared for each logger.
- `default_mode` - if multiple modes are defined, this key specifies which mode should be selected when the system starts up. If not specified, the default mode will be the first one defined in the `modes` section.

OpenRVDAS also recognizes a few other, optional top-level keys 
- `cruise` - containing a cruise id and other useful metadata
- `includes` - to include other YAML files to be merged with the file in question
- `variables` - a dictionary of key-value pairs that can be substituted into the cruise definition file to simplify managing configuration changes

Below, we will begin first with a description of a fully-specified 'traditional' cruise definition file, then describe how includes, variables and logger templates can be used to create more compact and manageable cruise definition files.

## A Traditional Cruise Definition File

A traditional full cruise definition file will consist of `cruise`, `loggers`, `configs`, `modes` and `default_mode` top-level keys.

### Cruise Metadata

By convention, each cruise definition file will begin with a `cruise` key indicating the cruise name, its start and end dates, and any other metadata the operator feels relevant. At present, the only use that is made of this section is that the cruise id is displayed at the top of the OpenRVDAS web GUI.
```
# Optional cruise metadata
cruise:
  id: NBP1406
  start: "2014-06-01"  # Quoted so YAML doesn't auto-convert to a datetime
  end: "2014-07-01"
```

### Loggers

The next top-level key is (traditionally) the `loggers` key, specifying the set of configs that are associated with a particular "logger":
```
loggers:
  gyr1:
    configs:
    - gyr1-off
    - gyr1-net
    - gyr1-net+file
  knud:
    configs:
    - knud-off
    - knud-net
    - knud-net+file
  mwx1:
    configs:
    - mwx1-off
    - mwx1-net
    - mwx1-net+file
  rtmp:
    configs:
    - rtmp-off
    - rtmp-net
    - rtmp-net+file
  s330:
    configs:
    - s330-off
    - s330-net
    - s330-net+file
```

### Configs

The `loggers` key just declares what configs exist and are associated with each logger. The actual definitions of these configs is left to - wait for it - entries under the top-level `configs` key. 
```
configs:
  gyr1-off: {}  # empty configuration
  gyr1-net:
    readers:
      class: SerialReader
      kwargs:
        baudrate: 9600
        port: /dev/ttyr15
    transforms:
      ...
    writers:
      ...
  gyr1-net+file:
    ...

  knud-off: {}  # empty configuration
  knud-net:
    readers:
      class: SerialReader
      kwargs:
        baudrate: 9600
        port: /dev/ttyr15
    transforms:
      ...
    writers:
      ...
  knud-net+file:
    ...
  ...
```
Observe that for accounting purposes, OpenRVDAS uses an empty dict to denote the configuration of a logger that isn't running.

### Modes

Typically, a vessel will have sets of logger configurations that
should all be run together: which should be running when in port, when
underway, etc.

To accommodate easy reference to these modes of operation, we include
a top-level `mode` key containing a dictionary mapping from mode names to configurations that should be running in that mode:
```
# Which configs should be running when in which mode
modes:
  'off':  # needs to be quoted because 'off' is a YAML keyword
    eng1: eng1-off
    gyr1: gyr1-off
    knud: knud-off
    mwx1: mwx1-off
    rtmp: rtmp-off
    s330: s330-off
  port:
    eng1: eng1-net
    gyr1: gyr1-net
    knud: knud-off
    mwx1: mwx1-net
    rtmp: rtmp-off
    s330: s330-net
  underway:
    eng1: eng1-net+file
    gyr1: gyr1-net+file
    knud: knud-net+file
    mwx1: mwx1-net+file
    rtmp: rtmp-net+file
    s330: s330-net+file
```

Modes may also more compactly consist of just a list of configuration names, rather than the full `logger: config` mapping:

```
# Which configs should be running when in which mode
modes:
  'off': [eng1-off, gyr1-off, knud-off, mwx1-off, rtmp-off, s330-off]
  
  port: [eng1-net, gyr1-net, knud-off, mwx1-net, rtmp-off, s330-net]

  underway: [eng1-net+file, gyr1-net+file, knud-net+file, mwx1-net+file,
             rtmp-net+file, s330-net+file]
```
_Note that if no `modes` key is present, the system will infer and create a default mode by selecting the first config declared for each logger._

### Default Mode

The optional `default_mode` key specifies, lacking any other information, which mode the system should be initialized to on startup. If it is absent, the system will use the first mode defined in the `modes` section as its default mode (in the above case, `off`).

```
default_mode: 'off'  # Quoted because 'off' is a YAML keyword
```

As indicated above, a sample full cruise definition file may be viewed at
[NBP1406_cruise_full.yaml](https://github.com/OceanDataTools/openrvdas/blob/master/test/NBP1406/NBP1406_cruise_full.yaml).

## Cruise Definition Simplifications

The traditional way of specifying a cruise definition file is...verbose. The full sample NBP1406 cruise definition file is over 1500 lines and difficult to maintain or modify. To date, different institutions have coped with this by generating these files mechanically, either from customized scripts or databases.

We have recently implemented several cruise definition file features that may (optionally) be used to reduce this complexity: inline logger definitions, variables, and logger templates. Cruise definitions using these features may be loaded the same way as traditional cruise definitions - OpenRVDAS will recognize and expand them internally.

### Inline Logger Definitions

Instead of simply declaring configs inside a logger definition, the full set of a logger's configurations may be defined inline, e.g.:
```
loggers:
  gyr1:
    configs:
      'off': {}  # empty configuration
      net:
        readers:
          class: SerialReader
          kwargs:
            baudrate: 9600
            port: /dev/ttyr15
        transforms:
          ...
        writers:
          ...
      net+file:
        ...
```
When loaded, this definition will parse the configs out into logger-prepended configuration names: `gyr1-off`, `gyr1-net` and `gyr1-net+file`

This form of logger definition can be mixed and matched with the traditional form that only declares the configurations by name and relies on them to be defined in full under a separate top-level `configs` key.


### Variables

OpenRVDAS now supports a simple use of variables in a cruise definition file. If defined as a dict under a top-level `variables` key, the loading script will look for instances of the variables enclosed in `<<double_angle_brackets>>` and perform text substitutions.
```
###########################################################
# Global variables - can be overridden by individual loggers
variables:
  cruise: NBP1406
  raw_udp_port: 6224
  file_root: /var/tmp/log
  parse_definition_path: test/NBP1406/devices/nbp_devices.yaml
 
###########################################################
# Optional cruise metadata
cruise:
  id: <<cruise>>
  start: "2014-06-01"  # Quoted so YAML doesn't auto-convert to a datetime
  end: "2014-07-01"
```

### Logger Templates

What makes variable substitution most powerful is the implementation of logger templates, defined under the top-level `logger_templates` key. Many loggers in a typical installation will be almost identical, varying only by a few fields, such as ports, or prefixes to be attached.

The [serial_logger_template](https://github.com/OceanDataTools/openrvdas/blob/master/local/logger_templates/serial_logger_template.yaml) encodes a typical set of logger configurations for a serial-port-based instrument:
```
###################
logger_templates:
  #################
  serial_logger_template:
    configs:
      'off': {}
      
      # Read, timestamp, prefix, and send off to net via UDP
      net:
        readers:
        - class: SerialReader
          kwargs:
            baudrate: <<baud_rate>>
            port: <<serial_port>>
        transforms:
        - class: TimestampTransform
        - class: PrefixTransform
          kwargs:
            prefix: <<logger>>
        writers:
        - class: UDPWriter
          kwargs:
            port: <<raw_udp_port>>
            destination: <<udp_destination>>
            
      # Write both to network and save to file
      net+file:
        readers:
        - class: SerialReader
          kwargs:
            baudrate: <<baud_rate>>
            port: <<serial_port>>
        transforms:
        - class: TimestampTransform
        writers:
        - class: LogfileWriter
          kwargs:
            filebase: <<file_root>>/<<logger>>/raw/<<cruise>>_<<logger>>
        - class: ComposedWriter
          kwargs:
            transforms:
            - class: PrefixTransform
              kwargs:
                prefix: <<logger>>
            writers:
              - class: UDPWriter
                kwargs:
                  port: <<raw_udp_port>>
                  destination: <<udp_destination>>

```

A logger, rather than declaring or defining its configurations, may simply refer to a template, and provide its own local variables to extend or overwrite the global variables defined in the top-level `variables` section:

```
###########################################################
loggers:
  PCOD:
    logger_template: serial_logger_template
    variables:
      serial_port: /tmp/tty_PCOD
      baud_rate: 4800
  cwnc:
    logger_template: serial_logger_template
    variables:
      serial_port: /tmp/tty_cwnc
      baud_rate: 19200
```

### Included Files

The logger templates may either be included directly in the cruise definition file under the top-level `logger_templates:` key, as above, or included by reference from an `includes:` section:
```
###########################################################
includes:
  - local/logger_templates/serial_logger_template.yaml
  - local/logger_templates/parse_data_logger_template.yaml
  - local/logger_templates/true_winds_logger_template.yaml
  - local/logger_templates/snapshot_logger_template.yaml
```
Note that filepaths specified in the `includes` block may include wildcards such as `*`, and the files may themselves have an `includes` section. All logger templates are merged into the top-level dict, with later keys overwriting earlier ones.

Non-fully-specified paths will use the base installation directory (typically `/opt/openrvdas`), but this may be overridden by means of a top-level `includes_base_dir` key:

```
###########################################################
includes_base_dir: /opt/local/logger_templates
includes:
  - *_logger_template.yaml
```

Use of logger templates and variable substitution make it possible to take an unwieldy full cruise definition file of over a thousand lines and bring it down to not much more than a hundred.
