---
permalink: /serial_readers/
title: "Reading from Serial Ports"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true
---

OpenRVDAS provides two readers for acquiring data from serial ports:

* **[SerialReader](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/serial_reader.py)** — for instruments that stream data continuously without prompting.
* **[PolledSerialReader](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/polled_serial_reader.py)** — for instruments that must be queried, initialized, or shut down via commands sent over the same serial connection.

Both require the `pyserial` package:

```
pip install pyserial
```

---

# SerialReader

`SerialReader` opens a serial port and returns one record per `read()` call.  By default a record is delimited by a newline, but this can be overridden with `eol` or `max_bytes`.

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | *(required)* | Serial port device, e.g. `/dev/ttyUSB0` or `/dev/ttyr15` |
| `baudrate` | `9600` | Baud rate |
| `bytesize` | `8` | Data bits (5–8) |
| `parity` | `'N'` | Parity: `'N'`one, `'E'`ven, `'O'`dd, `'M'`ark, `'S'`pace |
| `stopbits` | `1` | Stop bits |
| `timeout` | `None` | Read timeout in seconds; `None` blocks indefinitely |
| `xonxoff` | `False` | Software flow control |
| `rtscts` | `False` | Hardware RTS/CTS flow control |
| `dsrdtr` | `False` | Hardware DSR/DTR flow control |
| `write_timeout` | `None` | Write timeout in seconds |
| `inter_byte_timeout` | `None` | Inter-character timeout in seconds |
| `exclusive` | `None` | Exclusive access mode (POSIX only) |
| `max_bytes` | `None` | If set, read exactly this many bytes per record instead of reading until EOL |
| `eol` | `None` | Record delimiter; defaults to newline (`\n`) |
| `allow_empty` | `False` | If `True`, return empty records instead of discarding them |
| `encoding` | `'utf-8'` | Character encoding; set to `None` to return raw bytes |
| `encoding_errors` | `'ignore'` | Error handling: `'strict'`, `'replace'`, `'ignore'`, or `'backslashreplace'` |

## Python Example

```python
from logger.readers.serial_reader import SerialReader

reader = SerialReader(port='/dev/ttyUSB0', baudrate=9600)

while True:
    record = reader.read()
    print(record)
```

## Configuration File Example

```yaml
readers:
  class: SerialReader
  kwargs:
    port: /dev/ttyr15
    baudrate: 9600
```

With a non-standard record delimiter:

```yaml
readers:
  class: SerialReader
  kwargs:
    port: /dev/ttyr05
    baudrate: 4800
    eol: \r
```

---

# PolledSerialReader

`PolledSerialReader` extends `SerialReader` with the ability to send commands to the instrument on startup (`start_cmd`), before each read (`pre_read_cmd`), and on shutdown (`stop_cmd`).  It accepts all `SerialReader` parameters plus the three described below.

## Additional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `start_cmd` | `None` | Command(s) sent once when the port is first opened |
| `pre_read_cmd` | `None` | Command(s) sent before every `read()` call |
| `stop_cmd` | `None` | Command(s) sent when the reader is destroyed |

### Command Format

Each command parameter may be:

* **A string** — written to the port as-is.
* **A list of strings** — each string is written in sequence.
* **A dict of lists of strings** (`pre_read_cmd` only) — the lists are cycled through on successive `read()` calls (see [Cycling Queries](#cycling-queries) below).

### The `__PAUSE__` Directive

Any command string beginning with `__PAUSE__` causes the reader to sleep rather than write to the port.  An optional duration in seconds may follow:

```
__PAUSE__        # pause for 1 second (default)
__PAUSE__ 0.5   # pause for half a second
__PAUSE__ 5     # pause for 5 seconds
```

This is useful when an instrument needs settling time between commands.

### Timeout and pre_read_cmd

If `timeout` is set and a `read()` call times out without receiving data, the reader re-issues `pre_read_cmd` (advancing to the next key if it is a dict) and tries again.  This allows the reader to recover automatically if the instrument misses a query.

## Python Examples

### Simple Query-Response

```python
from logger.readers.polled_serial_reader import PolledSerialReader

reader = PolledSerialReader(
    port='/dev/ttyUSB0',
    baudrate=9600,
    pre_read_cmd='SEND\r\n',
)

while True:
    record = reader.read()
    print(record)
```

### Initialization and Shutdown

```python
reader = PolledSerialReader(
    port='/dev/ttyUSB0',
    baudrate=4800,
    start_cmd=[
        'MODE ASCII\r\n',
        '__PAUSE__ 1',      # wait for mode switch to take effect
        'OUTPUT ON\r\n',
    ],
    pre_read_cmd='?\r\n',
    stop_cmd='OUTPUT OFF\r\n',
)
```

### Cycling Queries

When `pre_read_cmd` is a dict, successive `read()` calls cycle through its keys.  This is useful for instruments that expose multiple channels, each requiring a distinct query:

```python
reader = PolledSerialReader(
    port='/dev/ttyUSB0',
    baudrate=9600,
    timeout=2,
    pre_read_cmd={
        'channel_a': ['QUERY A\r\n'],
        'channel_b': ['QUERY B\r\n'],
    },
)
```

## Configuration File Examples

### Simple Query-Response

```yaml
readers:
  class: PolledSerialReader
  kwargs:
    port: /dev/ttyUSB0
    baudrate: 9600
    pre_read_cmd: "SEND\r\n"
```

### Initialization and Shutdown

```yaml
readers:
  class: PolledSerialReader
  kwargs:
    port: /dev/ttyUSB0
    baudrate: 4800
    start_cmd:
      - "MODE ASCII\r\n"
      - "__PAUSE__ 1"
      - "OUTPUT ON\r\n"
    pre_read_cmd: "?\r\n"
    stop_cmd: "OUTPUT OFF\r\n"
```

### Cycling Queries

```yaml
readers:
  class: PolledSerialReader
  kwargs:
    port: /dev/ttyUSB0
    baudrate: 9600
    timeout: 2
    pre_read_cmd:
      channel_a:
        - "QUERY A\r\n"
      channel_b:
        - "QUERY B\r\n"
```

### Full Logger Configuration

```yaml
sensor1->net+file:
  name: sensor1->net+file
  readers:
    class: PolledSerialReader
    kwargs:
      port: /dev/ttyUSB0
      baudrate: 9600
      timeout: 5
      start_cmd: "INIT\r\n"
      pre_read_cmd: "SEND\r\n"
      stop_cmd: "SLEEP\r\n"
  transforms:
    - class: TimestampTransform
    - class: PrefixTransform
      kwargs:
        prefix: sensor1
  writers:
    - class: LogfileWriter
      kwargs:
        filebase: /log/current/sensor1
    - class: UDPWriter
      kwargs:
        port: 6224
```

---

# See Also

* [Introduction to Loggers]({{ "/intro_to_loggers/" | relative_url }}) — logger architecture overview
* [Logger Configuration Files]({{ "/logger_configuration_files/" | relative_url }}) — YAML configuration reference
* [OpenRVDAS Components]({{ "/components/" | relative_url }}) — full component listing