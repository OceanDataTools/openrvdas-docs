---
permalink: /logger_configuration_files/
title: "Logger Configuration Files"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

## Overview

Please see the [OpenRVDAS Introduction to Loggers]({{ "/intro_to_loggers/" | relative_url }})
for a general introduction to loggers.

The workhorse utility of the OpenRVDAS system is the Listener class,
which can be invoked either indirectly by ```server/logger_runner.py```
or ```server/logger_manager.py``` or directly via the ```listen.py```
script. When the listen.py script is run, it can take (among other
things) a configuration file describing what Readers, Transforms and
Writers should be run together and with what parameters.

```
logger/listener/listen.py --config_file gyr_logger.yaml
```
This document describes the format and rationale behind those
configuration files.

## Logger Configurations

In the example above, the file gyr\_logger.yaml might contain the
following text:

```
readers: # A single reader in this case
- class: SerialReader
  kwargs:
    baudrate: 9600
    port: /dev/ttyr15
transforms:  # List of transforms - these will be applied in series
- class: TimestampTransform  # no kwargs needed for TimestampTransform
- class: PrefixTransform
  kwargs:
    prefix: gyr1
writers:  # List of writers - these will be called in parallel
- class: LogfileWriter
  kwargs:
    filebase: /log/current/gyr1
- class: UDPWriter
  kwargs:
    port: 6224
```

The configuration is in [YAML format](https://yaml.org/). YAML is a strict
superset of JSON, but is more concise and allows comments, so is preferred
for readability. (Yes, logger configuration files __can__ be written as JSON strings if you need to.)

In the case above, the configuration definition specifies the following workflow:

![Dual output configuration](../assets/images/dual_writer.png)

The definition contains three essential keys: "readers",
"transforms", and "writers" (optional keys "name", "interval" and
"check_format" are also accepted, in keeping with the arguments taken
by the Listener class constructor).

The values for these keys should be a list of dicts each dict defining
a component.

Recall that a Listener instance runs all its Readers in parallel, pipes
their output to its Transforms in series, and dispatches their resulting
output to all its Writers in parallel, as illustrated below:

![Generic listener data flow](../assets/images/generic_listener.png)

Each Reader, Transform and Writer is specified by a dict with two keys:
``class`` and ``kwargs``. Unsurprisingly, the ``class`` key specifies the
class name of the component to be instantiated, e.g. ``SerialReader`` or
``TimestampTransform``.  The ``kwargs`` key should be a dict whose key-value
pairs are the argument names and values to be used in instantiated that class.
For example, the definition above corresponds to instantiating the following
components in Python:
```
readers = [
 SerialReader(baudrate=9600, port='/dev/ttyr15')
]
transforms = [
 TimestampTransform(),  # no kwargs needed for TimestampTransform
 PrefixTransform(prefix='gyr1')
]
writers = [
  LogfileWriter(filebase='/log/current/gyr1'),
  UDPWriter(port=6224)
]
```
Arguments for which the class provides default values may be omitted if
desired.

### Redirecting Standard Error

The Listener class accepts a further (optional) special key,
``stderr_writers``, that tells the Listener where to send any
diagnostic messages. Its format is the same as that for the normal
``writers`` key.

### Reader, Transform and Writer Documentation

The code is generally the best documentation of itself, and we have tried to create detailed and extensive docstrings in the headers of each component in the `logger/[readers, transforms, writers]` directories. Machine-extracted documentation on Reader, Transform and Writer components
are available, along with their arguments, is available in HTML format in the
[doc/html](https://htmlpreview.github.io/?https://github.com/oceandatatools/openrvdas/blob/master/docs/html/index.html) directory of this project, though it may lag behind the code itself. The [README.md](https://github.com/OceanDataTools/openrvdas/blob/master/docs/html/README.md) file
in that directory explains how the documentation is generated.

### Including Your Own Components

The 'imports' section of ``listen.py`` includes most of the commonly-used Readers, Transforms and Writers, but it is straightforward to include your own without modifying the core listener code by specifying the module path in your configuration file:

```
readers:
  class: TextFileReader
  kwargs:  # initialization kwargs
    file_spec: LICENSE

transforms:
- class: MySpecialTransform
  module: local.path.to.module.file
  kwargs:
    module_param: "my special transform parameter"

writers:
  class: TextFileWriter
```
Please see the [Introduction to OpenRVDAS Components]({{ "/components/" | relative_url }}) document for details on creating your own Readers, Transforms and Writers.

## Managing Multiple Loggers and Configurations

A typical vessel installation will necessitate running multiple loggers at once, each running a configuration specific to a particular sensor, and possibly also to a specific phase of a cruise. This set of loggers and configurations can be defined and managed via a [Cruise Definition File]({{ "/cruise_definition_files/" | relative_url }}), which is described in an accompanying document.
