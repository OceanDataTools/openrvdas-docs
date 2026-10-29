---
permalink: /parsing/
title: "Record Parsing"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
Perhaps the second most crucial task that a data acquisition system
must accomplish (after reliably storing incoming data records) is to
be able to parse those records into meaningful values that can be
displayed and manipulated to provide insight.

OpenRVDAS provides two parse transforms for this purpose:

- The **ParseTransform** ([logger/transforms/parse\_transform.py](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/parse_transform.py)), which uses the [PyPI parse module](https://pypi.org/project/parse/) to match format strings. This is the original and default parser in OpenRVDAS.
- The **RegexParseTransform** ([logger/transforms/regex\_parse\_transform.py](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/regex_parse_transform.py)), a newer alternative that uses Python's built-in regular expressions.

Both transforms take text records and parse them into structured data with named fields and timestamps. They are thin wrappers around the underlying [RecordParser](https://github.com/OceanDataTools/openrvdas/blob/master/logger/utils/record_parser.py) and [RegexParser](https://github.com/OceanDataTools/openrvdas/blob/master/logger/utils/regex_parser.py) classes, respectively.

Input:

```
seap 2014-08-01T00:00:00.814000Z $GPZDA,000000.70,01,08,2014,,*6F
seap 2014-08-01T00:00:00.814000Z $GPGGA,000000.70,2200.112071,S,01756.360200,W,1,10,0.9,1.04,M,,M,,*41
seap 2014-08-01T00:00:00.931000Z $GPVTG,213.66,T,,M,9.4,N,,K,A*1E
```

Output:

```
{'data_id': 'seap',
  'fields': {'SeapGPSDay': 1,
             'SeapGPSMonth': 8,
             'SeapGPSTime': 0.7,
             'SeapGPSYear': 2014},
  'timestamp': 1406851200.814},
 {'data_id': 'seap',
  'fields': {'SeapAntennaHeight': 1.04,
             'SeapEorW': 'W',
             'SeapFixQuality': 1,
             'SeapGPSTime': 0.7,
             'SeapHDOP': 0.9,
             'SeapLatitude': 2200.112071,
             'SeapLongitude': 1756.3602,
             'SeapNorS': 'S',
             'SeapNumSats': 10},
  'timestamp': 1406851200.814},
 {'data_id': 'seap',
  'fields': {'SeapCourseTrue': 213.66, 'SeapMode': 'A', 'SeapSpeedKt': 9.4},
  'timestamp': 1406851200.931}]
```

# Record Format

Both transforms expect the raw text records they receive to arrive in a
predefined format, by default beginning with a data\_id identifying the
physical or virtual sensor that created the record, followed by an ISO
8601-compliant timestamp and the body of the message:

```
data_id timestamp field_string
```
e.g.
```
s330 2014-08-01T00:00:00.522000Z $PSXN,23,0.35,-1.74,218.26,0.58*13
```

The first field, the ``data_id``, is what the parser will use to try to
match to a device definition (described later), and from that, the format it expects the record fields to be in.

This default record format, including timestamp format, delimiters and other factors, can be overridden at construction time by specifying the argument `record_format=...`.

# Using the ParseTransform

The [ParseTransform](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/parse_transform.py) uses the [PyPI parse module](https://pypi.org/project/parse/) to match format strings against incoming records.

## Parsing with field patterns

The simplest way to use the parser is to provide field patterns
directly. Each pattern is a format string using the ``parse`` module's
``{FieldName:type}`` syntax:

```
  transform = ParseTransform(
      field_patterns=['{:d}:{GravityValue:d} {GravityError:d}']
  )
  transform.transform('grv1 2017-11-10T01:00:06.572Z 01:024557 00')

  # Returns:
  # {'data_id': 'grv1',
  #  'timestamp': 1510275606.572,
  #  'fields': {'GravityValue': 24557, 'GravityError': 0}}
```

The parser automatically extracts the ``data_id`` and ``timestamp``
from the record envelope and applies the field patterns to the
remaining field string. The ``field_patterns`` argument is a list; the
parser tries each pattern in order and uses the first one that matches.

## Multiple message types

Some devices, such as GPS receivers, output several different types of
messages. To handle this, ``field_patterns`` can be specified as a
**dict** keyed by message type instead of a plain list:

```
  transform = ParseTransform(
      field_patterns={
          'GGA': '$GPGGA,{GPSTime:f},{Latitude:f},{NorS:w},{Longitude:f},{EorW:w},{FixQuality:d},{NumSats:d},{HDOP:of},{AntennaHeight:of},M,{GeoidHeight:of},M,{LastDGPSUpdate:of},{DGPSStationID:od}*{CheckSum:x}',
          'HDT': '$GPHDT,{HeadingTrue:f},T*{CheckSum:x}',
          'VTG': '$GPVTG,{CourseTrue:of},T,{CourseMag:of},M,{SpeedKt:of},N,{SpeedKm:of},K,{Mode:w}*{CheckSum:x}',
      }
  )
```

When a dict is used, the matching key (e.g., ``GGA``, ``HDT``) is
assigned to the ``message_type`` field of the resulting record. This
is the preferred approach for devices that emit multiple message types,
as it allows downstream consumers to identify which type of message
produced a given record.

Each dict value may be a single format string or a list of format
strings (for message types with multiple variants).

## The RegexParseTransform alternative

The [RegexParseTransform](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/regex_parse_transform.py) is a newer alternative that uses Python's built-in regular expressions instead of the PyPI ``parse`` module. It unifies the functionality of the earlier CSIRO and CORIOLIX contributed regex transforms into the main OpenRVDAS tree.

```
  transform = RegexParseTransform(
      field_patterns=[
          r'(?P<CounterUnits>\d+):(?P<GravityValue>\d+)\s+(?P<GravityError>\d+)']
  )
  transform.transform('grv1 2017-11-10T01:00:06.572Z 01:024557 00')
```

The RegexParseTransform uses Python named capture groups
(``(?P<FieldName>pattern)``) instead of parse-style format strings
(``{FieldName:type}``). Like the ParseTransform, it supports
``field_patterns`` as either a list or a dict keyed by message type.
The key differences are described in
[RegexParser Differences](#regexparser-differences) below.

## Output format

A parser can return results in three formats:

- **DASRecord** — a [DASRecord](https://github.com/OceanDataTools/openrvdas/blob/master/logger/utils/das_record.py) object; this is the default (only!) output format for `RegexParseTransform`; `ParseTransform` can be set to output DASRecords by setting ``return_das_record=True``.

- **Python dict** — a dictionary with ``data_id``, ``timestamp``, and ``fields`` keys. For historical reasons, this is the default output format for `ParseTransform`.

- **JSON** — the dict in JSON-encoded string form (for `ParseTransform`, use ``return_json=True``).

If metadata about the fields are provided (either in the metadata
argument or in the device definitions) and the ``metadata_interval``
argument is non-zero, it will be attached to records at intervals of
that many seconds.

# Device and Device Type Definitions

As an alternative to specifying ``field_patterns`` directly, both
parsers can load format definitions from YAML files via the
``definition_path`` argument. This is the preferred approach for
installations with many instruments, as it centralizes format
definitions, enables per-device field renaming, and attaches metadata
to parsed fields.

```
  transform = ParseTransform(
      definition_path='local/devices/nbp_devices.yaml'
  )
  transform.transform('grv1 2017-11-10T01:00:06.572Z 01:024557 00')

  # Returns:
  # {'data_id': 'grv1',
  #  'timestamp': 1510275606.572,
  #  'fields': {'Grv1GravityValue': 24557, 'Grv1GravityError': 0}}
```

Here the parser looks up ``grv1`` in the definition file, finds its
device type, applies the matching format, and renames the fields
according to the device definition (e.g., ``GravityValue`` becomes
``Grv1GravityValue``).

## Devices and device types

The definition system works with two abstractions:

- A **device type** describes a class of instrument — e.g., a SeaPath
  330 GPS or a Bell Aerospace BGM-3 Gravimeter. It defines the message
  format(s) that any instrument of that type can emit.
- A **device** is a specific instance of a device type — e.g., the
  particular SeaPath 330 with serial number #S330-415-AX019G installed
  on the bridge of the N.B. Palmer. It maps the device type's generic
  field names to device-specific names.

## Device type definitions

Every device we wish to parse data from must have an associated device
type definition. The device type definition encodes what type of
messages that device is capable of emitting. A device may put out more
than one type of message, but we expect that _any_ SeaPath 330 or Bell
Aerospace BGM-3 will put out the same types of messages as any other.

In the case of the gravimeter, we capture this by defining a message
format along with metadata describing what each of the fields in that
format represent (in YAML, below):

```
Gravimeter_BGM3:
  description: "Bell Aerospace BGM-3"
  format: "{CounterUnits:d}:{GravityValue:d} {GravityError:d}"
  fields:
    CounterUnits:
      description: "apparently a constant 01"
    GravityValue:
      units: "Flit Count"
      description: "mgal = flit count x 4.994072552 + bias"
    GravityError:
      description: "unknown semantics"
```

As we noted above, some sensors can output multiple types of messages. To accommodate this, the definition may specify a list of formats to try matching. The parser will use the first one that matches the whole line. 

Alternatively, a dict of formats may be provided, with the message type
for each serving as the key and either a single format string or a list
of format strings serving as the value. When a format is specified as a
dict entry, the message type key is assigned  to the ``message_type`` 
field of the resulting DASRecord. This is the preferred approach for
devices that emit multiple message types, as it allows downstream
consumers to identify which type of message produced
a given record:

```
Seapath330:
  # If device type can output multiple formats, include them as a
  # list. Parser will use the first one that matches the whole line.
  format:
    # GGA message has several formats
    GGA:
    - "$GPGGA,{GPSTime:f},{Latitude:f},{NorS:w},{Longitude:f},{EorW:w},{FixQuality:d},{NumSats:d},{HDOP:of},{AntennaHeight:of},M,{GeoidHeight:of},M,{LastDGPSUpdate:of},{DGPSStationID:od}*{CheckSum:x}"
    - "$INGGA,{GPSTime:f},{Latitude:f},{NorS:w},{Longitude:f},{EorW:w},{FixQuality:d},{NumSats:d},{HDOP:of},{AntennaHeight:of},M,{GeoidHeight:of},M,{LastDGPSUpdate:of},{DGPSStationID:od}*{CheckSum:x}"
    # For illustration, HDT message has only single format
    HDT: "$INHDT,{HeadingTrue:f},T*{CheckSum:x}"
    # For illustration, INVTG and INZDA are given no message type
    - "$INVTG,{CourseTrue:of},T,{CourseMag:of},M,{SpeedKt:of},N,{SpeedKm:of},K,{Mode:w}*{CheckSum:x}"
    - "$INZDA,{GPSTime:f},{GPSDay:d},{GPSMonth:d},{GPSYear:d},{LocalHours:od},{L
    ...
```

When handed a message that it believes to come from a SeaPath 330, the
parser will try the formats in the order listed and apply the first
one that matches.

## Device definitions

In addition to device type definitions, we need to be able to specify
which physical devices we have in our system map to which device
types. We do this with _device_ definitions, as in the YAML definition
for a device with id `s330` on the N.B. Palmer:

```
s330:
  device_type: "Seapath330"
  serial_number: "unknown"
  description: "Just another device description."

  # Map from device_type field names to names specific for this
  # specific device.
  fields:
    GPSTime: "S330GPSTime"
    FixQuality: "S330FixQuality"
    NumSats: "S330NumSats"
    HDOP: "S330HDOP"
    AntennaHeight: "S330AntennaHeight"
    GeoidHeight: "S330GeoidHeight"
    LastDGPSUpdate: "S330LastDGPSUpdate"
```

The definition tells us what this device's device type is and gives us a
mapping from the device type's generic field names ('SpeedKt') to the
field name we will want this datum to have in our system
('S330SpeedKt').

Any fields in the device type definition that are not mapped in the device
definition's "fields" section will be silently dropped, allowing us to
propagate only the fields we care about. 

## Definition files

Definitions should be encoded in a YAML file:

```
################################################################################
# Device definitions for the Nathaniel B. Palmer
#
# See README.md in this directory

includes:
  - local/usap/nbp/devices/HydroDasNBP.yaml
  - local/usap/devices/MastWx.yaml
  - local/devices/*.yaml

######################################
devices:
  s330:
    device_type: "Seapath330"
    ...
  grv1:
    device_type: "Gravimeter_BGM3"
    ...
  ...

######################################
device_types:
  Seapath330:
    ...
  Gravimeter_BGM3:
    ...
```
Device and device type definitions may be aggregated from multiple files
by use of `includes` entries, as illustrated above.

A top-level "devices" key contains a dictionary of device
definitions. A top-level "device\_types" key contains a dictionary of
device type definitions. An optional "includes" key may contain a list
of other files from which device and device type definitions should be
loaded.

Note that an older, now deprecated (but still accepted) file format
did not require segregating device and device\_type definitions by
keys, and allowed listing them all together at the top level. To
distinguish device definitions from device\_type definitions, each
definition was required to contain a "category" key specifying its
type:

```
grv1:
  category: "device"
  device_type: "Gravimeter_BGM3"
  ...
Gravimeter_BGM3:
  category: "device_type"
  ...

```

## Loading definitions

To load one or more definition files, use the ``definition_path`` argument when instantiating a parser:

```
# nbp_devices.yaml includes other, generic definition files
parser = RecordParser(definition_path='local/usap/nbp/devices/nbp_devices.yaml')
```

```
# Manually including an assortment of definition files
parser = RecordParser(definition_path='local/devices/*.yaml,/opt/openrvdas/local/devices/*.yaml')
```

If no ``definition_path`` is specified, the parser will look for
definitions in `DEFAULT_DEFINITION_PATH`, defined as `local/devices/*.yaml`.

## Built-in NMEA device type definitions

OpenRVDAS provides a built-in library of NMEA 0183 device type definitions
in [logger/devices/NMEA\_0183.yaml](https://github.com/OceanDataTools/openrvdas/blob/master/logger/devices/NMEA_0183.yaml),
covering 13 common device categories and 108 format patterns. These can
be included in your definition files and referenced by your device
definitions. See the
[NMEA Device Type Library]({{ "/nmea_device_types/" | relative_url }}) for details.

# Creating Device Type Definitions

If your system takes input from non-NMEA sources and you are unable to
find existing device type definitions that fit your needs, you will need
to create your own. This section describes how to write your own
using the RecordParser's format string syntax. For a step-by-step
walkthrough of adding a complete device, see
[Adding a Sensor]({{ "/adding_a_sensor/" | relative_url }}).

## Format string syntax

The RecordParser format strings use the [PyPI parse
module](https://pypi.org/project/parse/). The format
consists of literal text that is to be matched in a string along with
interspersed ``{VariableName:VariableFormat}`` definitions.

### Standard format types

The variable formats understood roughly correspond to those in Python 3's ``print``
statement:

- d: digits
- w: letters, numbers and underscores
- f: fixed point numbers
- g: general numbers

and more elaborate formats:

- ti: ISO8601 datetime
- ts: Linux format timestamp
- x: hexadecimal numbers

Please consult the documentation at [https://pypi.org/project/parse/](https://pypi.org/project/parse/) for the full list.

### Custom format types

For all the power encoded into PyPi's parse module, the available
formats have a few limitations. Most notably, it is difficult to cope
with missing fields in a record. For example, a SeaPath 330's
GPVTG message in theory provides both true and magnetic headings, and speed in both knots and km/hour:

```
  "$GPVTG,{CourseTrue:f},T,{CourseMag:f},M,{SpeedKt:f},N,{SpeedKm:f},K,{Mode:w}*{CheckSum:x}"
```

In practice, some of those fields may be empty:

```
seap 2014-08-01T00:00:00.931000Z $GPVTG,213.66,T,,M,9.4,N,,K,A*1E
```
But the 'f' format does not recognize empty numbers, so the above
record will not match our format.

To cope with this, OpenRVDAS defines several extra formats in
[logger/utils/record\_parser\_formats.py](https://github.com/OceanDataTools/openrvdas/blob/master/logger/utils/record_parser_formats.py):

 - od = optional integer
 - of = optional generalized float
 - og = optional generalized number - will parse '#VALUE!' as None
 - ow = optional sequence of letters, numbers, underscores
 - nc = any ASCII text that is not a comma
 - nlat = NMEA-formatted latitude or longitude, converted to decimal degrees
 - nlat_dir = NMEA-formatted latitude or longitude, along with hemisphere (N/E/W/S) converted to signed decimal degrees. South and West are considered negative, North and East positive.

Using these, the extended format string

```
  "$GPVTG,{CourseTrue:of},T,{CourseMag:of},M,{SpeedKt:of},N,{SpeedKm:of},K,{Mode:w}*{CheckSum:x}"
```
 gracefully parses the received record, parsing and converting
  fields where they are found, and ignoring those that are missing.

See 'Custom Type Conversions' in
[https://pypi.org/project/parse/](https://pypi.org/project/parse/) for
a discussion of how format types work.

# RegexParser Differences

The [RegexParser](https://github.com/OceanDataTools/openrvdas/blob/master/logger/utils/regex_parser.py) operates on the same principles as the RecordParser but differs in several important ways.

## Regex format syntax

The RegexParser uses Python named capture groups instead of ``parse``-style format strings:

```
(?P<field_name>regex_pattern)
```

For example, where the RecordParser would use:

```
{GravityValue:d}
```

the RegexParser equivalent is:

```
(?P<GravityValue>\d+)
```

This gives full access to Python's regular expression engine, making
it straightforward to match irregular or ambiguous formats that are
difficult to express with the ``parse`` module.

## Type conversion with the ``fields`` argument

Because regular expressions capture everything as strings, the
RegexParser does not perform type conversion during parsing. Instead,
type information is provided separately via the ``fields`` argument,
which maps field names to their desired types:

```
  transform = RegexParseTransform(
      field_patterns=[
          r'(?P<CounterUnits>\d+):(?P<GravityValue>\d+)\s+(?P<GravityError>\d+)'],
      fields={
          'CounterUnits': 'int',
          'GravityValue': 'int',
          'GravityError': 'int'
      }
  )
```

Without the ``fields`` argument, all captured values remain as
strings. When device definitions are loaded via ``definition_path``,
type conversions and field name mappings are applied automatically from
the definitions.

## Output

The RegexParseTransform always returns
[DASRecord](https://github.com/OceanDataTools/openrvdas/blob/master/logger/utils/das_record.py)
objects — it does not support returning plain dicts or JSON strings.
If field patterns are specified as a dict, the matching key is assigned
to the ``message_type`` field of the DASRecord.

## YAML configuration example

Using the RegexParser in a logger configuration:

```
  readers:
  - class: UDPReader
    kwargs:
      port: 6224
  transforms:
  - class: TimestampTransform
  - class: PrefixTransform
    kwargs:
      prefix: grv1
  - class: RegexParseTransform
    kwargs:
      field_patterns:
        - '(?P<CounterUnits>\d+):(?P<GravityValue>\d+)\s+(?P<GravityError>\d+)'
      fields:
        CounterUnits: int
        GravityValue: int
        GravityError: int
  writers:
  - class: CachedDataWriter
    kwargs:
      data_server: localhost:8766
```

# TimestampTransform

The [TimestampTransform](https://github.com/OceanDataTools/openrvdas/blob/master/logger/transforms/timestamp_transform.py) is typically the first transform in a logger pipeline. Its default behavior is to assign the current system clock time as the record's timestamp:

```yaml
transforms:
- class: TimestampTransform
- class: ParseTransform
  kwargs:
    definition_path: local/devices/*.yaml
```

## NMEA timestamp extraction

When records carry embedded NMEA timestamps (GPS GGA, RMC, ZDA, etc.), using those embedded times produces more accurate results than the system clock. Set `use_nmea_timestamp: true` to extract the timestamp directly from the NMEA sentence, falling back to the system clock only if extraction fails:

```yaml
transforms:
- class: TimestampTransform
  kwargs:
    use_nmea_timestamp: true
    nmea_timestamp_timeout: 1        # seconds a prior NMEA timestamp stays valid (default: 1)
    nmea_time_drift_threshold: 0.1   # warn if NMEA time drifts from system clock by this many seconds (default: 0.1)
```

The extractor supports the following sentence types:

**Standard NMEA sentences with embedded timestamps:** GGA, GLL, RMC, ZDA, GBS, GST, GNS, BWC, TLL, TTM

**Proprietary sentences:** PASHR, PGRMF, PTNL GGK/PJK, PUBX 00/04, PSIMSNS, PSIMSSB, PSXN 26

**Sentences without timestamps** (VTG, HDT, etc.): the extractor reuses the most recently extracted NMEA timestamp for up to `nmea_timestamp_timeout` seconds. After that window expires it falls back to the system clock and logs a warning.

### Parameters

| Parameter | Default | Description |
|---|---|---|
| `use_nmea_timestamp` | `False` | Extract timestamp from NMEA sentence instead of system clock |
| `nmea_timestamp_timeout` | `1` | Seconds to keep a previously-extracted timestamp valid for non-timestamped sentences such as VTG and HDT |
| `nmea_time_drift_threshold` | `0.1` | Log a warning when NMEA time differs from the system clock by more than this many seconds; set to `null` to disable |
| `quiet` | `False` | Suppress all warnings (drift, staleness, clock fallback) |

When `use_nmea_timestamp` is `true` and extraction fails (unrecognized sentence type or malformed fields), the transform falls back to the system clock and logs a warning (suppressed if `quiet: true`).

# Choosing a Parser

| Feature | RecordParser | RegexParser |
|---|---|---|
| **Format syntax** | `{FieldName:type}` (parse module) | `(?P<FieldName>regex)` (Python re) |
| **External dependency** | [PyPI parse](https://pypi.org/project/parse/) | None (built-in re) |
| **Type conversion** | Built into format strings (`:d`, `:f`, etc.) | Via `fields` argument or device definitions |
| **Custom optional types** | Yes (`:od`, `:of`, `:og`, etc.) | Use regex alternation (e.g., `[\d.]*`) |
| **Output format** | Dict by default; DASRecord or JSON optional | Always DASRecord |
| **Transform class** | ParseTransform | RegexParseTransform |
| **listen.py flag** | `--transform_parse` | Use YAML configuration |
| **Best for** | Standard formats, quick setup | Complex patterns, no-dependency environments |

## Field patterns vs. device definitions

Both parsers support two modes of specifying formats:

- **Direct field patterns** — pass ``field_patterns`` (and for
  RegexParser, ``fields``) at construction time. Simplest for one-off
  parsing or a small number of known formats.
- **Device/device type definition files** — provide a
  ``definition_path`` pointing to YAML files. Preferred for
  multi-instrument installations where you want centralized format
  management, per-device field renaming, and field metadata.

Note that the two parsers use different format syntaxes in their device
type definition files — RecordParser definitions use ``parse``-module
format strings (e.g., ``{FieldName:f}``) while RegexParser definitions
use Python regex patterns (e.g., ``(?P<FieldName>[\d.]+)``). The
device and device type YAML structure is otherwise the same, so
switching between parsers requires rewriting the format strings but not
restructuring the definition files.

# Using listen.py

The ParseTransform can be invoked from the command line ``listen.py`` script:

  ```
  listen \
      --port 6224 \
      --transform_parse \
      --write_file -
  ```

When called from listen.py, the optional RecordParser initialization
parameters may be specified with additional command line arguments
(which, in the spirit of the listen.py script, must appear on the
command line **before** the ``--transform_parse`` argument):

  ```
  listen \
      --udp 6224 \
      --parse_definition_path "local/devices/*.yaml,/opt/openrvdas/local/devices/*.yaml" \
      --parse_to_json \
      --transform_parse \
      --write_file -
  ```
