---
permalink: /guide/reference/
title: '10\. Reference'
layout: single
toc: true
toc_label: "In this section"
toc_icon: "list"
toc_sticky: true
---
The lookup material: every standard component and what it's for, where
the exact parameters live, the YAML you'll write, the vocabulary the
rest of the Guide uses, and what OpenRVDAS assumes about the network it
runs on.

# Component Catalog

Every logger is built from the three kinds of component introduced in
[section 1]({{ "/guide/introduction/#how-it-works" | relative_url }}):
readers, which get records from somewhere; transforms, which change
them; and writers, which put them somewhere. The tables below list every
component that ships with OpenRVDAS v2.7.0, grouped by what it's for,
with the parameters you'll usually set. A component's name links to its
page in the [API reference](#api-reference), which has every parameter
and its default. Where the Guide has already shown a component at work,
the table says where.

In a configuration file, every component is written the same way: its
`class`, and a `kwargs` mapping holding whichever parameters you
set. Parameters with defaults may be left out:

```
readers:
- class: SerialReader
  kwargs:
    port: /dev/ttyUSB0
    baudrate: 4800
```

A component of your own is written the same way, with a `module` key
naming the Python file it lives in; see
[Creating and Testing Loggers]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

## Readers

A reader's `read()` method returns one record, or a list of records,
each time it's called. When a configuration lists several readers,
they run in parallel and their records merge.

**Instruments and hardware**

| Reader | What it does | Parameters you'll set |
|---|---|---|
| [`SerialReader`]({{ "/api/openrvdas/logger/readers/serial_reader.html#SerialReader" | relative_url }}) | Reads lines from a serial port. The workhorse, used throughout [section 5]({{ "/guide/your-vessel/#readers-for-your-hardware" | relative_url }}). | `port`, `baudrate`; `parity`, `stopbits`, `bytesize`, `timeout`, `eol` for the awkward cases; `max_bytes` to read fixed-size chunks instead of lines |
| [`PolledSerialReader`]({{ "/api/openrvdas/logger/readers/polled_serial_reader.html#PolledSerialReader" | relative_url }}) | A `SerialReader` for instruments that must be asked: sends commands before reading starts, before each read, and at shutdown. | Everything `SerialReader` takes, plus `start_cmd`, `pre_read_cmd`, `stop_cmd` |
| [`ModBusTCPReader`]({{ "/api/openrvdas/logger/readers/modbus_reader.html#ModBusTCPReader" | relative_url }}) | Polls registers or coils on a Modbus TCP device (a PLC, flowmeter or winch controller). | `host`, `port`, `registers`, `slave`, `function`, `interval` |
| [`ModBusSerialReader`]({{ "/api/openrvdas/logger/readers/modbus_serial_reader.html#ModBusSerialReader" | relative_url }}) | The same, for Modbus RTU over a serial line. | `port`, `baudrate`, `registers`, `slave`, `function`, `interval` |

**Network**

| Reader | What it does | Parameters you'll set |
|---|---|---|
| [`UDPReader`]({{ "/api/openrvdas/logger/readers/udp_reader.html#UDPReader" | relative_url }}) | Reads UDP packets, broadcast or multicast, as records. This is how second-line loggers hear the front-line loggers' broadcast ([section 4]({{ "/guide/nbp-tutorial/#following-a-record-through-the-system" | relative_url }})). | `port`; `interface`; `mc_group` for multicast; `reuseport` to share a port with another process |
| [`TCPReader`]({{ "/api/openrvdas/logger/readers/tcp_reader.html#TCPReader" | relative_url }}) | Listens for a TCP connection and reads records from it. | `port`, `interface`, `eol` |
| [`HTTPReader`]({{ "/api/openrvdas/logger/readers/http_reader.html#HTTPReader" | relative_url }}) | Fetches a URL every `interval` seconds and returns the response as a record. | `url`; `method`, `headers`, `payload`, `interval`, `timeout` |
| [`MQTTReader`]({{ "/api/openrvdas/logger/readers/mqtt_reader.html#MQTTReader" | relative_url }}) | Subscribes to an MQTT broker's channel. | `broker`, `channel`; `port`, `qos` |
| [`RedisReader`]({{ "/api/openrvdas/logger/readers/redis_reader.html#RedisReader" | relative_url }}) | Subscribes to a Redis pub/sub channel. | `channel`, `password` |
| [`WebsocketReader`]({{ "/api/openrvdas/logger/readers/websocket_reader.html#WebsocketReader" | relative_url }}) | Connects to a `WebsocketWriter` (below) and reads what it serves. | `uri`; `check_cert` |
| [`SocketReader`]({{ "/api/openrvdas/logger/readers/socket_reader.html#SocketReader" | relative_url }}) | Reads from a Unix domain socket, for processes on the same machine. | `channel` |

**OpenRVDAS's own data**

| Reader | What it does | Parameters you'll set |
|---|---|---|
| [`CachedDataReader`]({{ "/api/openrvdas/logger/readers/cached_data_reader.html#CachedDataReader" | relative_url }}) | Subscribes to fields on the cached data server. The reader of every derived-data logger ([section 6]({{ "/guide/computed-values/#derived-data-loggers" | relative_url }})); the subscription vocabulary is in [section 7]({{ "/guide/storage-displays/#the-cached-data-server" | relative_url }}). | `subscription`, `data_server`; `return_das_record`; `use_wss` |
| [`LogfileReader`]({{ "/api/openrvdas/logger/readers/logfile_reader.html#LogfileReader" | relative_url }}) | Reads the timestamped files a `LogfileWriter` wrote, in date order, optionally at the speed the timestamps dictate. The basis of `simulate_data`. | `filebase`; `use_timestamps`, `interval`, `tail`, `time_acceleration_factor` |
| [`TextFileReader`]({{ "/api/openrvdas/logger/readers/text_file_reader.html#TextFileReader" | relative_url }}) | Reads lines from one or more plain text files. | `file_spec`; `tail`, `interval`, `refresh_file_spec` |
| [`DatabaseReader`]({{ "/api/openrvdas/logger/readers/database_reader.html#DatabaseReader" | relative_url }}) | Reads field values back out of a database a `DatabaseWriter` filled. | `fields`, `database`, `host`, `user`, `password`; `tail` |
| [`SealogReader`]({{ "/api/openrvdas/logger/readers/sealog_reader.html#SealogReader" | relative_url }}) | Subscribes to a Sealog server's event stream, so that an event entered in Sealog can drive OpenRVDAS (see `SealogControlTransform` below). | `uri`, `subs` |

**Structural**

| Reader | What it does | Parameters you'll set |
|---|---|---|
| [`ComposedReader`]({{ "/api/openrvdas/logger/readers/composed_reader.html#ComposedReader" | relative_url }}) | Bundles readers and transforms into something that looks like one reader: the readers run in parallel, the transforms in series. | `readers`, `transforms` |
| [`TimeoutReader`]({{ "/api/openrvdas/logger/readers/timeout_reader.html#TimeoutReader" | relative_url }}) | Wraps another reader and returns a message only when it has been silent for `timeout` seconds. A simple watchdog. | `reader`, `timeout`, `message`, `resume_message` |

`NetworkReader`, which older definitions used for both UDP and TCP, is
gone: the class still exists so that an old definition fails with a
clear message, but it reads nothing. Use `UDPReader` or `TCPReader`.

## Transforms

A transform's `transform()` method takes a record and returns a
record, or `None` to drop it. Transforms run in series, in the order
written, and each one's output is the next one's input. Most
transforms expect either a *text* record (a line, as a reader
delivered it) or a *parsed* record (a `DASRecord` or a dict of named
fields, as a parsing transform produced it); the tables say which.

**Shaping text records**

| Transform | What it does | Parameters you'll set |
|---|---|---|
| [`TimestampTransform`]({{ "/api/openrvdas/logger/transforms/timestamp_transform.html#TimestampTransform" | relative_url }}) | Prepends the current time to a text record. The first transform in nearly every front-line logger. | none usually; `time_format`; `use_nmea_timestamp` to take the time from the record's own NMEA sentence instead |
| [`PrefixTransform`]({{ "/api/openrvdas/logger/transforms/prefix_transform.html#PrefixTransform" | relative_url }}) | Prepends a `data_id` (the logger's name) to a text record, so the parser can tell whose record it is. | `prefix` |
| [`SliceTransform`]({{ "/api/openrvdas/logger/transforms/slice_transform.html#SliceTransform" | relative_url }}) | Keeps only some whitespace- or `sep`-separated fields of a text record, by position: `fields: '1:'` drops the first. | `fields`, `sep` |
| [`SplitTransform`]({{ "/api/openrvdas/logger/transforms/split_transform.html#SplitTransform" | relative_url }}) | Splits one record into several at a separator, newlines by default. For readers that deliver several lines at once. | `sep` |
| [`StripTransform`]({{ "/api/openrvdas/logger/transforms/strip_transform.html#StripTransform" | relative_url }}) | Removes whitespace, named characters or everything unprintable from a record. | `chars`, `unprintable`, `strip_prefix`, `strip_suffix` |
| [`RegexReplaceTransform`]({{ "/api/openrvdas/logger/transforms/regex_replace_transform.html#RegexReplaceTransform" | relative_url }}) | Applies regular-expression substitutions to a record. | `patterns` |
| [`RegexFilterTransform`]({{ "/api/openrvdas/logger/transforms/regex_filter_transform.html#RegexFilterTransform" | relative_url }}) | Passes only records matching a regular expression (or, with `negate`, only those that don't). | `pattern`, `negate` |
| [`UniqueTransform`]({{ "/api/openrvdas/logger/transforms/unique_transform.html#UniqueTransform" | relative_url }}) | Passes a record only if it differs from the previous one. | none |
| [`NMEAChecksumTransform`]({{ "/api/openrvdas/logger/transforms/nmea_checksum_transform.html#NMEAChecksumTransform" | relative_url }}) | Passes an NMEA sentence only if its checksum is right. | `checksum_optional`, `error_message` |
| [`XMLAggregatorTransform`]({{ "/api/openrvdas/logger/transforms/xml_aggregator_transform.html#XMLAggregatorTransform" | relative_url }}) | Collects lines until a complete XML element named `tag` has arrived, then passes it on as one record. | `tag` |

**Parsing and converting between record formats**

| Transform | What it does | Parameters you'll set |
|---|---|---|
| [`ParseTransform`]({{ "/api/openrvdas/logger/transforms/parse_transform.html#ParseTransform" | relative_url }}) | Turns a prefixed, timestamped text record into named fields using device and device-type definitions. The subject of [Parsing and Device Types]({{ "/guide/your-vessel/#parsing-and-device-types" | relative_url }}). | `definition_path`; `return_das_record`, `return_json`; `metadata_interval` |
| [`RegexParseTransform`]({{ "/api/openrvdas/logger/transforms/regex_parse_transform.html#RegexParseTransform" | relative_url }}) | Parses a text record with a regular expression whose named groups become fields, with optional type conversion. For a one-off format that doesn't warrant a device type. | `record_format` or `field_patterns`; `data_id`, `fields` |
| [`ParseNMEATransform`]({{ "/api/openrvdas/logger/transforms/parse_nmea_transform.html#ParseNMEATransform" | relative_url }}) | An older NMEA parser, driven by separate sensor, sensor-model and message definition files rather than device types. The Guide documents `ParseTransform` instead. | `sensor_path`, `sensor_model_path`, `message_path` |
| [`ConvertFieldsTransform`]({{ "/api/openrvdas/logger/transforms/convert_fields_transform.html#ConvertFieldsTransform" | relative_url }}) | Converts fields of a parsed record to given types, including combining a NMEA latitude or longitude with its hemisphere field into a signed number. | `fields`; `delete_source_fields` |
| [`SelectFieldsTransform`]({{ "/api/openrvdas/logger/transforms/select_fields_transform.html#SelectFieldsTransform" | relative_url }}) | Keeps, or deletes, named fields of a parsed record. | `keep` or `delete` |
| [`ExtractFieldTransform`]({{ "/api/openrvdas/logger/transforms/extract_field_transform.html#ExtractFieldTransform" | relative_url }}) | Returns just one field's value from a parsed record. | `field_name` |
| [`FormatTransform`]({{ "/api/openrvdas/logger/transforms/format_transform.html#FormatTransform" | relative_url }}) | Produces a text record from a parsed one, using a Python format string: `'Course: {S330CourseTrue}'`. | `format_str`; `defaults` |
| [`ToDASRecordTransform`]({{ "/api/openrvdas/logger/transforms/to_das_record_transform.html#ToDASRecordTransform" | relative_url }}) | Wraps a dict, a JSON string or a bare value as a `DASRecord`. | `data_id`; `field_name` for bare values |
| [`ToJSONTransform`]({{ "/api/openrvdas/logger/transforms/to_json_transform.html#ToJSONTransform" | relative_url }}) | Serializes a parsed record as JSON text, for a writer that wants text. | `pretty` |
| [`FromJSONTransform`]({{ "/api/openrvdas/logger/transforms/from_json_transform.html#FromJSONTransform" | relative_url }}) | The reverse: JSON text to a dict or `DASRecord`. | `das_record` |

**Computing new values** (all take parsed records; see
[section 6]({{ "/guide/computed-values/" | relative_url }}))

| Transform | What it does | Parameters you'll set |
|---|---|---|
| [`ComputedFieldsTransform`]({{ "/api/openrvdas/logger/transforms/computed_fields_transform.html#ComputedFieldsTransform" | relative_url }}) | Computes new fields from algebraic expressions over existing ones. The general-purpose tool of [Computed Fields]({{ "/guide/computed-values/#computed-fields" | relative_url }}) and [Calibrations]({{ "/guide/computed-values/#calibrations" | relative_url }}). | `fields`; `cache_inputs`, `update_on_fields`, `max_field_age`, `data_id` |
| [`TrueWindsTransform`]({{ "/api/openrvdas/logger/transforms/true_winds_transform.html#TrueWindsTransform" | relative_url }}) | Computes true wind from course, speed, heading and relative wind ([Derived Data Loggers]({{ "/guide/computed-values/#derived-data-loggers" | relative_url }})). | the five input field names, the three output names; `update_on_fields`, `max_field_age`, `zero_line_reference` |
| [`InterpolationTransform`]({{ "/api/openrvdas/logger/transforms/interpolation_transform.html#InterpolationTransform" | relative_url }}) | Resamples fields onto a regular interval by averaging, interpolating or holding values over a window ([Averaging and Resampling]({{ "/guide/computed-values/#averaging-and-resampling" | relative_url }})). | `field_spec`, `interval`, `window` |
| [`ModifyValueTransform`]({{ "/api/openrvdas/logger/transforms/modify_value_transform.html#ModifyValueTransform" | relative_url }}) | Applies a slope and offset to named fields. `ComputedFieldsTransform` does this and more; kept for existing definitions. | `fields` |
| [`DeltaTransform`]({{ "/api/openrvdas/logger/transforms/delta_transform.html#DeltaTransform" | relative_url }}) | Emits each field's change since its previous value, or its rate of change. | `rate`; `field_type: {heading: polar}` for angles |
| [`MaxMinTransform`]({{ "/api/openrvdas/logger/transforms/max_min_transform.html#MaxMinTransform" | relative_url }}) | Emits a `field:max` or `field:min` whenever a field sets a new extreme. | none |
| [`CountTransform`]({{ "/api/openrvdas/logger/transforms/count_transform.html#CountTransform" | relative_url }}) | Emits `field:count`, how many times each field has been seen. | none |
| [`SubsampleTransform`]({{ "/api/openrvdas/logger/transforms/subsample_transform.html#SubsampleTransform" | relative_url }}) | Deprecated. Logs a warning pointing to `InterpolationTransform`. | — |

**Quality control and conditional action**

| Transform | What it does | Parameters you'll set |
|---|---|---|
| [`QCFilterTransform`]({{ "/api/openrvdas/logger/transforms/qc_filter_transform.html#QCFilterTransform" | relative_url }}) | Returns nothing while fields are within bounds, and a warning message when one isn't. The message can be a logger manager command ([section 8]({{ "/guide/operations/#geofencing-and-conditional-control" | relative_url }})). Note that it emits on every out-of-range record, not only the first. | `bounds` (`field:min:max,...`), `message` |
| [`ValueFilterTransform`]({{ "/api/openrvdas/logger/transforms/value_filter_transform.html#ValueFilterTransform" | relative_url }}) | Removes out-of-range values from a parsed record and passes the rest. | `bounds` |
| [`GeofenceTransform`]({{ "/api/openrvdas/logger/transforms/geofence_transform.html#GeofenceTransform" | relative_url }}) | Emits a message when the vessel's position crosses a boundary loaded from a geographic data file in any format GeoPandas reads: GML, shapefile, GeoJSON ([Geofencing]({{ "/guide/operations/#geofencing-and-conditional-control" | relative_url }})). | `latitude_field_name`, `longitude_field_name`, `boundary_file_name`; `distance_from_boundary_in_degrees`, the two messages |
| [`ToSealogTransform`]({{ "/api/openrvdas/logger/transforms/to_sealog_transform.html#ToSealogTransform" | relative_url }}) | Maps a parsed record's fields onto a Sealog event, as described by a YAML configuration file, for a `SealogWriter`. | `config_file` |
| [`SealogControlTransform`]({{ "/api/openrvdas/logger/transforms/sealog_control_transform.html#SealogControlTransform" | relative_url }}) | Turns a Sealog event that signals a mode change, read by a `SealogReader`, into the matching logger manager command for a `LoggerManagerWriter`. | `event_value`, `event_option_name` |
| [`NMEATransform`]({{ "/api/openrvdas/logger/transforms/nmea_transform.html#NMEATransform" | relative_url }}) | Generates NMEA sentences (MWD, XDR, DPT, STN) from parsed fields, for feeding another system that wants NMEA. | `nmea_list`, plus the field names each sentence needs |

## Writers

A writer's `write()` method takes a record and puts it somewhere. When
a configuration lists several writers, each receives every record, in
parallel.

**Files**

| Writer | What it does | Parameters you'll set |
|---|---|---|
| [`LogfileWriter`]({{ "/api/openrvdas/logger/writers/logfile_writer.html#LogfileWriter" | relative_url }}) | Writes timestamped text records to `<filebase>-<date>`, starting a new file when the date changes. The standard raw-data writer. `filebase` may also be a mapping of regular expression to filebase, to sort records into files by content. | `filebase`; `split_interval`, `suffix`, `header` |
| [`FileWriter`]({{ "/api/openrvdas/logger/writers/file_writer.html#FileWriter" | relative_url }}) | Writes records to a file, or to stdout when no file is given, with optional splitting by time and a header. A general file writer for records that aren't timestamped; what `listen` uses for `--write_file -`. | `filebase`; `split_interval`, `header`, `mode` |
| [`TextFileWriter`]({{ "/api/openrvdas/logger/writers/text_file_writer.html#TextFileWriter" | relative_url }}) | Writes records to one named file, or to stdout when no file is given. | `filename`; `truncate`, `split_by_date` |
| [`RegexLogfileWriter`]({{ "/api/openrvdas/logger/writers/regex_logfile_writer.html#RegexLogfileWriter" | relative_url }}) | The regex-to-filebase sorting now built into `LogfileWriter`, as a separate class. Kept for existing definitions. | `filebase` mapping |

**Network**

| Writer | What it does | Parameters you'll set |
|---|---|---|
| [`UDPWriter`]({{ "/api/openrvdas/logger/writers/udp_writer.html#UDPWriter" | relative_url }}) | Broadcasts, multicasts or sends each record as a UDP packet. How front-line loggers publish to the rest of the system. | `port`; `destination` (omit to broadcast), `mc_interface` for multicast |
| [`TCPWriter`]({{ "/api/openrvdas/logger/writers/tcp_writer.html#TCPWriter" | relative_url }}) | Sends records over a TCP connection. | `destination`, `port` |
| [`SerialWriter`]({{ "/api/openrvdas/logger/writers/serial_writer.html#SerialWriter" | relative_url }}) | Writes records to a serial port, for feeding an instrument or a display that expects serial input. | `port`, `baudrate`, `eol` |
| [`WebsocketWriter`]({{ "/api/openrvdas/logger/writers/websocket_writer.html#WebsocketWriter" | relative_url }}) | Serves records to websocket clients, each of which gets every record from the moment it connects. | `uri`; `cert_file`, `key_file` for `wss://`; `max_queue_size` |
| [`MQTTWriter`]({{ "/api/openrvdas/logger/writers/mqtt_writer.html#MQTTWriter" | relative_url }}) | Publishes records to an MQTT broker's channel. | `broker`, `channel`; `qos` |
| [`RedisWriter`]({{ "/api/openrvdas/logger/writers/redis_writer.html#RedisWriter" | relative_url }}) | Publishes records to a Redis pub/sub channel. | `channel`, `password` |
| [`SocketWriter`]({{ "/api/openrvdas/logger/writers/socket_writer.html#SocketWriter" | relative_url }}) | Writes to a Unix domain socket, for a `SocketReader` on the same machine. | `channel` |
| [`EmailWriter`]({{ "/api/openrvdas/logger/writers/email_writer.html#EmailWriter" | relative_url }}) | Emails each record, bundling records that arrive within `max_freq` seconds into one message. For alerts. | `to`; `sender`, `subject`, `max_freq` |

**Databases and the cached data server**

| Writer | What it does | Parameters you'll set |
|---|---|---|
| [`CachedDataWriter`]({{ "/api/openrvdas/logger/writers/cached_data_writer.html#CachedDataWriter" | relative_url }}) | Publishes parsed records to the cached data server, buffering locally while the server is unreachable ([section 7]({{ "/guide/storage-displays/#the-cached-data-server" | relative_url }})). | `data_server`; `max_backup`; `use_wss` |
| [`InfluxDBWriter`]({{ "/api/openrvdas/logger/writers/influxdb_writer.html#InfluxDBWriter" | relative_url }}) | Writes parsed records to InfluxDB ([section 7]({{ "/guide/storage-displays/#influxdb" | relative_url }})). Connection details come from `database/influxdb/settings.py` unless overridden. | `bucket_name`; `measurement_name`, `tags` |
| [`GrafanaLiveWriter`]({{ "/api/openrvdas/logger/writers/grafana_live_writer.html#GrafanaLiveWriter" | relative_url }}) | Pushes parsed records straight to Grafana Live, for dashboards that update without a database in between. | `host`, `stream_id`, `api_token` or `token_file`; `secure` |
| [`DatabaseWriter`]({{ "/api/openrvdas/logger/writers/database_writer.html#DatabaseWriter" | relative_url }}) | Writes parsed records to a MySQL or MongoDB database as timestamped field-value rows. | `database`, `host`, `user`, `password` |
| [`GoogleSheetsWriter`]({{ "/api/openrvdas/logger/writers/google_sheets_writer.html#GoogleSheetsWriter" | relative_url }}) | Appends parsed records as rows of a Google Sheet, adding columns as new fields appear. | `sheet_name_or_id`, `auth_key_path`; `worksheet_name` |

**Controlling other systems**

| Writer | What it does | Parameters you'll set |
|---|---|---|
| [`LoggerManagerWriter`]({{ "/api/openrvdas/logger/writers/logger_manager_writer.html#LoggerManagerWriter" | relative_url }}) | Treats each text record as a command to the logger manager (`set_active_mode underway`), so a logger can drive the system ([section 8]({{ "/guide/operations/#geofencing-and-conditional-control" | relative_url }})). | `database`; `allowed_prefixes` to limit which commands it will pass |
| [`SealogWriter`]({{ "/api/openrvdas/logger/writers/sealog_writer.html#SealogWriter" | relative_url }}) | Submits records, shaped by `ToSealogTransform`, to a Sealog server as events. | `url`, `token`, `config_file` |

**Structural and diagnostic**

| Writer | What it does | Parameters you'll set |
|---|---|---|
| [`ComposedWriter`]({{ "/api/openrvdas/logger/writers/composed_writer.html#ComposedWriter" | relative_url }}) | Bundles transforms and writers into something that looks like one writer, so one branch of a logger can transform records differently from another. | `transforms`, `writers` |
| [`TimeoutWriter`]({{ "/api/openrvdas/logger/writers/timeout_writer.html#TimeoutWriter" | relative_url }}) | Wraps another writer and, when no record has arrived for `timeout` seconds, writes a message to it instead. | `writer`, `timeout`, `message`, `resume_message` |
| [`RecordScreenWriter`]({{ "/api/openrvdas/logger/writers/record_screen_writer.html#RecordScreenWriter" | relative_url }}) | Shows parsed records on the terminal as a continuously updated table of fields. For watching a parser's output. | none |

`NetworkWriter`, the counterpart of the removed `NetworkReader`, is
also gone; use `UDPWriter` or `TCPWriter`.

## Readers and writers in contrib/

The `contrib/` directory of the OpenRVDAS repository holds components
contributed by institutions, outside the core: Raspberry Pi sensor
readers under `contrib/raspberrypi/`, for instance. They're loaded with
a `module` key like any component outside `logger/`, and documented
where they live.

# API Reference

The **[OpenRVDAS API Reference]({{ "/api/" | relative_url }})** is the
automatically generated documentation for every logger component and
server module: class signatures, constructor arguments and docstrings.
It is generated with [pdoc](https://pdoc.dev/) from the source
itself, so it reflects the code rather than this Guide: when a
component's docstring is thin, the reference is thin too, and
improvements are welcome as pull requests against the docstrings.

It covers:

| Section | Contents |
|---|---|
| [Readers]({{ "/api/openrvdas/logger/readers.html" | relative_url }}), [Transforms]({{ "/api/openrvdas/logger/transforms.html" | relative_url }}), [Writers]({{ "/api/openrvdas/logger/writers.html" | relative_url }}) | The components above, one page per class, with every parameter |
| [Utils]({{ "/api/openrvdas/logger/utils.html" | relative_url }}) | Shared helpers: `DASRecord`, timestamps, the record parser and its format syntax, `validate_config` |
| [Listener]({{ "/api/openrvdas/logger/listener.html" | relative_url }}) | The machinery behind `listen`, which assembles a logger from a configuration |
| [Server]({{ "/api/openrvdas/server.html" | relative_url }}) | The logger manager, the cached data server and the server APIs |

Every page has a search box that indexes the whole reference, which is
the quickest way to find a class or a parameter by name. (The search at
the top of this site covers the Guide, not the reference.) The same
documentation is installed with the code: open
`openrvdas/docs/html/index.html` in a browser on a machine with no
network.

# YAML Syntax

Every OpenRVDAS configuration file is YAML: logger configurations,
cruise definitions, device and device-type definitions, calibration
files. YAML is a format for writing structured data that stays readable
to people. The full specification is large, but these files use a small
part of it, and this is all of that part.

## Two building blocks

Everything in a YAML file is one of two things. A **key-value pair** is
`key: value`, with a space after the colon:

```
class: SerialReader
baudrate: 9600
port: /dev/ttyr15
```

A set of key-value pairs is a *mapping*. (Python calls the same thing a
dictionary, or dict, and OpenRVDAS's messages sometimes do too.) A
**list** is lines beginning with a dash and a space:

```
- contrib/logger_templates/serial_logger_template.yaml
- contrib/logger_templates/parse_data_logger_template.yaml
```

Everything else is these two nested inside each other: a value can be
a mapping or a list, a list item can be a mapping, and so on down.

## Indentation shows what belongs to what

YAML has no braces or brackets. A line indented under another line
belongs to it:

```
cruise:
  id: NBP1406
  start: '2019-07-01'
  end: '2019-12-31'
```

Read this as "`cruise` is a mapping containing `id`, `start` and
`end`". Three rules keep indentation out of trouble:

1. **Indent with spaces, never tabs.** A tab in YAML indentation is an
   error. Set your editor to insert spaces when you press Tab.
2. **Two spaces per level** is the OpenRVDAS convention. What matters
   is that items at the same level start in the same column.
3. **Items at the same level must line up exactly.** If `start` is
   indented two spaces and `end` three, the file is either an error or
   means something you didn't intend.

A list item can be a mapping, and this pattern, a dash introducing a
small block, appears throughout OpenRVDAS files:

```
transforms:
- class: TimestampTransform
- class: PrefixTransform
  kwargs:
    prefix: gyr1
```

This says `transforms` is a list of two mappings. The first has one key,
`class`. The second has two, `class` and `kwargs`, and `kwargs` is
itself a mapping with one key. The `kwargs` line is indented to line up
with the `class` above it, which is what makes them part of the same
list item; a dash would start a new one.

## Values, and when to quote them

Most values need no quotes. Paths, hostnames and class names are fine
bare:

```
port: /dev/ttyr15
udp_destination: 255.255.255.255
filebase: /var/data/openrvdas/gyr1/raw/NBP1406_gyr1
```

But YAML reads some unquoted values as something other than text:

```
baudrate: 9600      # a number
flush: true         # a boolean
name: null          # nothing at all
mode: off           # also a boolean! see below
```

Quote a value in three situations:

* **It looks like something else but should be text.** Dates are the
  classic case, which is why cruise metadata writes `start:
  '2019-07-01'`; left bare, it becomes a date object. Version numbers
  and anything with a leading zero want quotes too.
* **It is `off`, `on`, `yes` or `no`.** YAML reads these as booleans,
  so a mode named `off` must be written `'off'`, both where the mode is
  defined and wherever it's referred to. A cruise definition with a mode
  named `False` has forgotten this.
* **It contains a colon followed by a space, or starts with `#`, `*`,
  `&`, `{` or `[`**, all of which mean something to YAML.

Single and double quotes both work. Double quotes process backslash
escapes such as `\n`; single quotes take the text literally, which
makes them the safer choice for paths and regular expressions.

## Comments

Everything from a `#` to the end of the line is a comment. OpenRVDAS
files use them freely, both for explanation and for banner lines that
separate sections:

```
###########################################################
# Global variables - can be overridden by individual loggers
variables:
  cruise: NBP1406
  raw_udp_port: 6224  # a comment can follow a value
```

## Reading a whole configuration

With those rules, a complete logger configuration reads straight
through:

```
readers:                        # one reader, as a one-item list
- class: SerialReader
  kwargs:                       # the arguments SerialReader takes
    baudrate: 9600
    port: /dev/ttyr15
transforms:                     # applied in order, top to bottom
- class: TimestampTransform     # no kwargs needed
- class: PrefixTransform
  kwargs:
    prefix: gyr1
writers:
- class: LogfileWriter
  kwargs:
    filebase: /var/data/openrvdas/gyr1/raw/gyr1
```

Three top-level keys, each holding a list of components, each
component a mapping of its class and its arguments. What the components
do is the subject of
[Creating and Testing Loggers]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }});
how cruise definitions build larger files from the same pieces is in
[Writing a Cruise Definition]({{ "/guide/your-vessel/#writing-a-cruise-definition" | relative_url }}).

OpenRVDAS adds one thing to plain YAML: a `<<variable_name>>` reference
in any value is replaced, when the file is loaded, by the variable's
value (see [Variables]({{ "/guide/your-vessel/#writing-a-cruise-definition" | relative_url }})).
That is OpenRVDAS's doing, not YAML's. A YAML checker that isn't
OpenRVDAS will accept the file but leave the references in place.

## Mistakes that bite newcomers

| Symptom | Cause |
|---|---|
| A parse error on a line that looks fine | A tab in the indentation. Most editors can show invisible characters. |
| A setting is silently ignored | It is indented under the wrong parent, so it belongs to the wrong component. |
| `kwargs` is treated as a separate list item | A stray dash before it, or indentation that doesn't line up with its `class`. |
| A value arrives as the wrong type | An unquoted date, an `off` or `yes` read as a boolean, or a leading zero dropped from a number. |
| One of two identical keys disappears | Duplicate keys at the same level. The last one wins. |
| An error pointing at a colon inside a value | An unquoted value containing `: `, which YAML reads as a new key. |
| The whole mapping becomes one text value | A missing space after a colon: `port:6224`. |

## Checking your work

Don't guess. `validate_config` checks both the YAML and whether the
result makes sense as an OpenRVDAS file, and takes any number of files
or patterns:

```
# One cruise definition
validate_config local/uuw/mvp/MVP2610_cruise.yaml

# Every device definition in a directory
validate_config local/uuw/devices/*.yaml
```

A tab in the indentation, for example, comes back as
`Invalid YAML: line 2, column 1: found character '\t' that cannot start any token`.
To check syntax alone, any YAML parser will do:

```
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" my_config.yaml
```

Silence means it parsed. Most editors also have a YAML mode that flags
indentation problems as you type.

One last thing: JSON is a subset of YAML, so a valid JSON file is also
valid YAML, and you may meet older OpenRVDAS configurations written
with braces and brackets. They mean exactly the same to the parser.
The indented style is simply easier to read and edit.

# Type Hints

This subsection is for people writing their own transforms and
writers. Two things make it worth reading: records don't always arrive
one at a time, and they don't always arrive in the type your code
expects.

A reader may return a list of records rather than one; a `SplitTransform`
certainly does. A transform upstream may return `None` to drop a
record. And a writer that wants text may be handed a `DASRecord`. In
the past, components dealt with this by passing explicit `input_format`
and `output_format` lists to their constructor. That is deprecated, and
logs a warning. Instead, a transform or writer declares what it
accepts with ordinary Python type hints on its `transform()` or
`write()` method, and the base class does the rest:

```
from typing import Union
from logger.transforms.transform import Transform

class ExampleTransform(Transform):
    def transform(self, record: Union[str, dict]) -> Union[str, None]:
        """Accepts strings or dicts. Returns a string or None."""
        if not self.can_process_record(record):
            return self.digest_record(record)

        if isinstance(record, dict):
            return str(record)
        return record.upper()
```

The pattern is two lines at the top of the method. `can_process_record()`
asks whether the record matches the type hints. If it doesn't,
`digest_record()` deals with it:

* If the record is a **list**, it calls your method on each item and
  returns the list of results, dropping any `None`s.
* If the record is **`None`** or an empty string, it returns `None`.
* If your hints include `str` and the record is a **number**, it
  converts the number to a string. If your hints include `str` and the
  record is a **`DASRecord`**, it serializes it as JSON.
* Otherwise it logs a warning saying what it received and what you can
  process, and returns `None`.

Without type hints, `can_process_record()` says yes to everything
except `None` and lists, so the two lines still buy you list handling
and `None` safety.

Readers don't take part: a reader produces records rather than
receiving them. If you'd rather initialize the type checking
explicitly, or silence its warnings, call `super().__init__(quiet=True)`
in your constructor; otherwise it initializes itself the first time
either method is called. The mechanism lives in
[`logger/utils/base_module.py`]({{ "/api/openrvdas/logger/utils/base_module.html" | relative_url }}),
which also implements `mirror_to`, the tap described in
[Creating and Testing Loggers]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

# Glossary

The Guide's vocabulary, each term with the section that explains it.

**Cached data server (CDS).** The in-memory hub of a running
installation: the latest values of every named field, served to
subscribers over websockets. Fed by `CachedDataWriter`, read by
`CachedDataReader`, the console and the displays.
[Section 7]({{ "/guide/storage-displays/#the-cached-data-server" | relative_url }}).

**Calibration file.** An included YAML file holding the slope and
offset variables that a `ComputedFieldsTransform` applies, so the
coefficients live in one place and change without touching the cruise
definition. [Section 6]({{ "/guide/computed-values/#calibrations" | relative_url }}).

**Component.** A reader, transform or writer: a Python class with a
`read()`, `transform(record)` or `write(record)` method. Loggers are
assembled from them. [Component Catalog](#component-catalog).

**Computed field.** A field calculated from other fields by an
expression in a `ComputedFieldsTransform`, such as a calibrated
temperature. [Section 6]({{ "/guide/computed-values/#computed-fields" | relative_url }}).

**Console.** The web interface for loading a cruise definition,
changing modes, starting and stopping loggers and watching their
status. OpenRVDAS has two, Django and React, and an installation runs
one. [Section 2]({{ "/guide/running-system/#the-web-console" | relative_url }}).

**Cruise definition.** The YAML file declaring everything a vessel
runs: its loggers, their configurations and its modes. The logger
manager turns it into a running system.
[Section 5]({{ "/guide/your-vessel/#writing-a-cruise-definition" | relative_url }}).

**`data_id`.** The short name a `PrefixTransform` prepends to a
record, `gyr1`, by which the parser recognizes which device the record
came from. Usually the logger's name.
[Section 4]({{ "/guide/nbp-tutorial/#following-a-record-through-the-system" | relative_url }}).

**`DASRecord`.** The Python object a parsed record becomes: a
`data_id`, a timestamp and a mapping of field names to values. Most
transforms that work on parsed records accept either a `DASRecord` or
the equivalent dict. [Section 5]({{ "/guide/your-vessel/#parsing-and-device-types" | relative_url }}).

**Derived data logger.** A logger whose reader subscribes to the
cached data server, whose transforms compute something from what
arrives, and whose writer publishes the result back. True winds is the
classic example. [Section 6]({{ "/guide/computed-values/#derived-data-loggers" | relative_url }}).

**Device, device type.** A device type is a make and model of
instrument (`Seapath330`) and describes the records it emits and how to
parse them. A device is one installed instance (`s330`) and maps the
type's generic field names onto names unique to that instrument
(`S330HeadingTrue`). [Section 5]({{ "/guide/your-vessel/#parsing-and-device-types" | relative_url }}).

**Field.** One named value in a parsed record: `Gyr1HeadingTrue`.
Fields are what the cached data server, the displays and the database
deal in. [Section 4]({{ "/guide/nbp-tutorial/#following-a-record-through-the-system" | relative_url }}).

**Front-line and second-line loggers.** A front-line logger is the
one attached to an instrument; the Guide's advice is that it should
timestamp, store and forward, and nothing more. A second-line logger
reads the front-line loggers' broadcast and does the parsing and
computing. [Section 5]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

**Includes.** The `includes` list in a cruise definition, naming
other YAML files, with wildcards, whose contents are merged in: logger
templates, calibration files, shared fragments.
[Section 5]({{ "/guide/your-vessel/#writing-a-cruise-definition" | relative_url }}).

**Institution repository.** Your own Git repository holding your
vessel's cruise definitions, device definitions, templates and custom
modules, linked into OpenRVDAS's `local/` directory so it survives
upgrades. [Section 5]({{ "/guide/your-vessel/#your-institutions-repository-and-local" | relative_url }}).

**Journal.** The logger manager's append-only record of every mode
change, logger start, stop, crash and recovery, one file per day.
[Section 8]({{ "/guide/operations/#snapshots-and-the-state-journal" | relative_url }}).

**`kwargs`.** The mapping, under each component in a configuration,
of the arguments its constructor takes. The name is Python's, for
"keyword arguments". [Component Catalog](#component-catalog).

**`listen`.** The command that runs a single logger from a
configuration file, or from command-line flags, in a terminal. The
tool for building and debugging loggers.
[Section 4]({{ "/guide/nbp-tutorial/#exploring-with-listen" | relative_url }}),
[Section 9]({{ "/guide/troubleshooting/#isolating-problems-with-listen" | relative_url }}).

**`lmcmd`.** The command-line client of the logger manager, for
doing from a terminal or a script what the console does.
[Section 8]({{ "/guide/operations/#command-line-and-api-control" | relative_url }}).

**Logger.** A pipeline serving one data stream: a reader, zero or
more transforms, one or more writers. Also the named entry in a cruise
definition that owns a set of interchangeable configurations.
[Section 1]({{ "/guide/introduction/#how-it-works" | relative_url }}).

**Logger configuration.** One way of running a logger, as a complete
`readers`/`transforms`/`writers` description: `gyr1-net`,
`gyr1-net+file`. An empty configuration, `{}`, means not running.
[Section 5]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

**Logger manager.** The service that runs a cruise definition:
starts and supervises the loggers, restarts them if they die, switches
their configurations on a mode change, and journals what it did.
[Section 1]({{ "/guide/introduction/#how-it-works" | relative_url }}).

**Logger template.** A set of configurations defined once with
variables where loggers differ, so that each logger using it needs
only a few lines. [Section 5]({{ "/guide/your-vessel/#writing-a-cruise-definition" | relative_url }}).

**`mirror_to`.** A key on any reader or transform naming a writer
that receives a copy of everything the component produces: a tap. How
the standard serial logger stores the raw record before prefixing it.
[Section 5]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

**Mode.** A named set of choices, one configuration per logger:
`port`, `underway`, `'off'`. Changing the mode moves every logger at
once. [Section 2]({{ "/guide/running-system/#starting-and-stopping-loggers" | relative_url }}).

**`module`.** The key, beside `class`, naming the Python module a
component of your own lives in, so the configuration can use
components outside OpenRVDAS's `logger/` directory.
[Section 5]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

**Parsed record.** A record whose fields have names: what a
`ParseTransform` produces from a text record, as a dict or a
`DASRecord`. [Section 5]({{ "/guide/your-vessel/#parsing-and-device-types" | relative_url }}).

**Reader, transform, writer.** See *component*.

**Record.** The unit of data that flows through a logger. It starts
as a line of text from an instrument, gains a timestamp and a
`data_id`, and may be parsed into fields.
[Section 4]({{ "/guide/nbp-tutorial/#following-a-record-through-the-system" | relative_url }}).

**`simulate_data`.** The command that replays recorded logfiles to
simulated serial ports or UDP, so a whole system can be exercised at a
desk. [Section 4]({{ "/guide/nbp-tutorial/#simulating-live-data" | relative_url }}).

**Snapshot.** A directory capturing the cruise definition and every
included file exactly as they were at a moment, with a manifest saying
whether what was running matched them.
[Section 8]({{ "/guide/operations/#taking-a-snapshot" | relative_url }}).

**Supervisor.** The process manager that keeps the logger manager,
the cached data server and the console running, and under which the
logger manager runs each logger. `supervisorctl status` is the first
diagnostic. [Section 9]({{ "/guide/troubleshooting/#where-to-look" | relative_url }}).

**Variable.** A value defined once under `variables` in a cruise
definition or an included file and referenced as `<<name>>` anywhere
in it, with an optional default: `<<baud_rate|9600>>`.
[Section 5]({{ "/guide/your-vessel/#writing-a-cruise-definition" | relative_url }}).

**Virtual environment.** The Python environment the installer builds
under `/opt/openrvdas/venv`, which must be activated in a terminal
before any OpenRVDAS command will be found.
[Section 3]({{ "/guide/installation/#the-python-virtual-environment" | relative_url }}).

# Security Assumptions

OpenRVDAS is built for a ship's protected internal network, among
people who are entitled to see the data. Its design makes the
following assumptions. Each is stated with what follows from it, so
you can judge where your installation needs more than the defaults.
[Securing the Installation]({{ "/guide/installation/#securing-the-installation" | relative_url }})
in section 3 covers what the installer can tighten.

**The server is physically secure.** Nothing protects against someone
with hands on the machine.

**The `root` and `rvdas` accounts are trusted.** Anyone with either
can change the code or the configuration. Other accounts on the
machine are not assumed trustworthy, but the only protection against
them is ordinary file permissions: another user could still load the
machine or fill its disk.

**Everyone on the network can see the data.** Loggers broadcast raw
records over UDP in the clear; anyone on the network segment can
listen. The cached data server has no authentication at all: anyone
who can reach it can subscribe to every field, and can also publish
values into it. Both consoles let anyone view the console and display
pages without logging in.

**Changing anything requires a login, and a login is trusted
completely.** Loading a cruise definition, changing the mode and
starting or stopping loggers require a login to the Django console, or
a login or API key for the React console and either console's API.
Both consoles will only load cruise definitions from the `local/` and
`test/` directories on the server. But a cruise definition can name
any component with any arguments, and a `module` key can import any
Python on the machine, so anyone who can log in *and* get a file into
`local/` can run arbitrary code as the `rvdas` user. Treat the console
password as you would the `rvdas` password.

**The supervisor web interface is as powerful as a login.** It can
start and stop every OpenRVDAS service. The installer leaves it
disabled unless you ask for it, and if you do, adds a password only if
you ask for that too. On any shared network, ask for both or neither.

**The network is not hostile.** The servers are not hardened against
denial-of-service attacks or deliberately malformed requests. If part
of an installation must be reachable from outside the ship's network,
for shoreside replication, say, put it behind something that is: a
VPN, an SSH tunnel, or a reverse proxy with its own authentication,
and turn on SSL so that passwords and data don't cross the open
network in the clear.

# Further Resources

* [RVTEC 2019 OpenRVDAS introduction (PDF)]({{ "/assets/files/rvtec-2019-openrvdas-intro.pdf" | relative_url }})
* [RVTEC 2024 Ocean Data Tools session (video)](https://www.youtube.com/watch?v=lRGulusX4sQ)
* [Ocean Data Tools home](https://oceandata.tools)
* [OpenRVDAS on GitHub](https://github.com/OceanDataTools/openrvdas), where
  bugs are reported and pull requests are welcome
* [The legacy documentation]({{ "/docs/" | relative_url }}): the
  standalone pages this Guide replaced, kept for their worked examples
  until each is absorbed
