---
permalink: /modbus_readers/
title: "Reading from Modbus Devices"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true
---

OpenRVDAS provides two readers for acquiring data from
[Modbus](https://en.wikipedia.org/wiki/Modbus) devices:

* **[ModBusTCPReader](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/modbus_reader.py)** — reads from Modbus TCP devices over an Ethernet/IP network.
* **[ModBusSerialReader](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/modbus_serial_reader.py)** — reads from Modbus RTU devices over a serial connection.

Both readers support the same Modbus function types, register specification
format, scan file format, and output modes.  They differ only in their
transport layer and associated connection parameters.

---

# Modbus Concepts

Modbus is a widely used protocol for reading data from industrial sensors and
controllers.  A brief primer on the terms used throughout this page:

**Slave / Unit ID** — Each device on a Modbus bus has a numeric ID (1–247).
A single reader can poll multiple slaves.

**Function types** — Modbus exposes four data tables, each addressed with a
different function code:

| Function type | Data | Read/Write |
|---|---|---|
| `holding_registers` | 16-bit unsigned integers | Read/Write |
| `input_registers` | 16-bit unsigned integers | Read-only |
| `coils` | single bits (booleans) | Read/Write |
| `discrete_inputs` | single bits (booleans) | Read-only |

**Register address** — A zero-based integer identifying a specific register or
coil within a slave's data table.

---

# ModBusTCPReader

[ModBusTCPReader](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/modbus_reader.py)
connects to a Modbus TCP server over Ethernet/IP.  Install its dependency
with:

```
pip install pyModbusTCP
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `host` | `'localhost'` | Hostname or IP address of the Modbus TCP server |
| `port` | `502` | TCP port of the Modbus server |
| `registers` | *(required if no `scan_file`)* | Register addresses to poll — see [Register Specification](#register-specification) |
| `slave` | `1` | Modbus slave/unit ID |
| `function` | `'holding_registers'` | Modbus function type: `'holding_registers'`, `'input_registers'`, `'coils'`, or `'discrete_inputs'` |
| `scan_file` | `None` | Path to a YAML scan file for multi-slave/multi-function polling — see [Scan Files](#scan-files) |
| `interval` | `10` | Seconds between consecutive `read()` calls |
| `sep` | `' '` | Separator between values in text output |
| `encoding` | `'utf-8'` | Output encoding; set to `None` for raw bytes |
| `encoding_errors` | `'ignore'` | Encoding error strategy: `'strict'`, `'replace'`, `'ignore'`, or `'backslashreplace'` |

## Python Examples

### Single slave, holding registers

```python
from logger.readers.modbus_reader import ModBusTCPReader

# Read holding registers 0–4 and 10–14 from slave 1 every 5 seconds
reader = ModBusTCPReader(
    host='192.168.1.10',
    port=502,
    registers='0:4,10:14',
    slave=1,
    function='holding_registers',
    interval=5,
)

while True:
    records = reader.read()
    for record in records:
        print(record)
```

### Coils

```python
reader = ModBusTCPReader(
    host='192.168.1.10',
    registers='0:7',
    function='coils',
    interval=1,
)
```

### Multi-slave via scan file

```python
reader = ModBusTCPReader(
    host='192.168.1.10',
    scan_file='/opt/openrvdas/local/scan_config.yaml',
    interval=10,
)
```

## Configuration File Examples

### Single slave

```yaml
readers:
  class: ModBusTCPReader
  kwargs:
    host: 192.168.1.10
    port: 502
    registers: "0:4,10:14"
    slave: 1
    function: holding_registers
    interval: 5
```

### Full logger configuration

```yaml
modbus->net+file:
  name: modbus->net+file
  readers:
    class: ModBusTCPReader
    kwargs:
      host: 192.168.1.10
      port: 502
      scan_file: /opt/openrvdas/local/scan_config.yaml
      interval: 10
  transforms:
    - class: TimestampTransform
    - class: PrefixTransform
      kwargs:
        prefix: modbus1
  writers:
    - class: LogfileWriter
      kwargs:
        filebase: /log/current/modbus1
    - class: UDPWriter
      kwargs:
        port: 6224
```

---

# ModBusSerialReader

[ModBusSerialReader](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/modbus_serial_reader.py)
connects to a Modbus RTU device over a serial port.  Install its dependency
with:

```
pip install "pymodbus[serial]"
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | `'/dev/ttyUSB0'` | Serial port device |
| `baudrate` | `9600` | Baud rate |
| `parity` | `'N'` | Parity: `'N'`one, `'E'`ven, or `'O'`dd |
| `stopbits` | `1` | Stop bits |
| `bytesize` | `8` | Data bits |
| `timeout` | `None` | Serial response timeout in seconds (minimum 1s; defaults to 2s) |
| `registers` | *(required if no `scan_file`)* | Register addresses to poll — see [Register Specification](#register-specification) |
| `slave` | `1` | Modbus slave/unit ID |
| `function` | `'holding_registers'` | Modbus function type: `'holding_registers'`, `'input_registers'`, `'coils'`, or `'discrete_inputs'` |
| `scan_file` | `None` | Path to a YAML scan file for multi-slave/multi-function polling — see [Scan Files](#scan-files) |
| `interval` | `1.0` | Seconds between consecutive `read()` calls (minimum 0.1) |
| `sep` | `' '` | Separator between values in text output |
| `encoding` | `'utf-8'` | Output encoding; set to `None` for raw bytes |
| `encoding_errors` | `'ignore'` | Encoding error strategy: `'strict'`, `'replace'`, `'ignore'`, or `'backslashreplace'` |

`ModBusSerialReader` also implements exponential backoff for serial connection
retries, starting at the `timeout` value and growing up to 30 seconds between
attempts.

## Python Examples

### Single slave, holding registers

```python
from logger.readers.modbus_serial_reader import ModBusSerialReader

reader = ModBusSerialReader(
    port='/dev/ttyUSB0',
    baudrate=19200,
    registers='0:5,10:15',
    slave=1,
    function='holding_registers',
    interval=5,
)

while True:
    records = reader.read()
    for record in records:
        print(record)
```

### Input registers with custom timeout

```python
reader = ModBusSerialReader(
    port='/dev/ttyUSB0',
    baudrate=9600,
    timeout=3,
    registers='0:9',
    function='input_registers',
    interval=2,
)
```

### Multi-slave via scan file

```python
reader = ModBusSerialReader(
    port='/dev/ttyUSB0',
    baudrate=19200,
    scan_file='/opt/openrvdas/local/scan_config.yaml',
    interval=5,
)
```

## Configuration File Examples

### Single slave

```yaml
readers:
  class: ModBusSerialReader
  kwargs:
    port: /dev/ttyUSB0
    baudrate: 19200
    registers: "0:5,10:15"
    slave: 1
    function: holding_registers
    interval: 5
```

### Full logger configuration

```yaml
modbus-serial->net+file:
  name: modbus-serial->net+file
  readers:
    class: ModBusSerialReader
    kwargs:
      port: /dev/ttyUSB0
      baudrate: 19200
      scan_file: /opt/openrvdas/local/scan_config.yaml
      interval: 5
      timeout: 3
  transforms:
    - class: TimestampTransform
    - class: PrefixTransform
      kwargs:
        prefix: modbus_serial1
  writers:
    - class: LogfileWriter
      kwargs:
        filebase: /log/current/modbus_serial1
    - class: UDPWriter
      kwargs:
        port: 6224
```

---

# Register Specification

Both readers accept register addresses as a **string** or a **list of tuples**.

## String format

A comma-separated list of individual addresses or ranges:

| Spec | Meaning |
|------|---------|
| `"5"` | Single register at address 5 |
| `"0:9"` | Registers 0 through 9 (10 registers) |
| `"0:4,10:14"` | Registers 0–4 and registers 10–14 |

```yaml
registers: "0:9"
registers: "0:4,10:14"
registers: "5"
```

## List of tuples

Each tuple is `(start_address, count)`:

```python
registers = [(0, 5), (10, 5)]   # same as "0:4,10:14"
registers = [(0, 10)]           # same as "0:9"
```

This form is only available when instantiating the reader in Python, not in
YAML configuration files.

---

# Scan Files

Both readers accept a `scan_file` parameter pointing to a YAML file that
specifies multiple slaves, function types, and register blocks in a single
configuration.  When `scan_file` is provided the `registers`, `slave`, and
`function` parameters are ignored.

## Format

```yaml
polls:
  - slave: 1
    function: holding_registers
    registers: "0:9"
  - slave: 1
    function: input_registers
    registers: "0:4"
  - slave: 2
    function: holding_registers
    registers: "0:4,10:14"
  - slave: 3
    function: coils
    registers: "0:7"
```

Each entry in `polls` requires:

| Key | Description |
|-----|-------------|
| `slave` | Modbus slave/unit ID |
| `registers` | Register specification string |
| `function` | *(optional)* Modbus function type; defaults to `holding_registers` |

`read()` returns a list with one entry per poll, in the order they appear in
the file.  If a poll fails, its entry in the list is `None`; other polls are
unaffected.

---

# Output Format

Both readers return a **list** from `read()`, with one element per configured
poll (one poll for single-slave use, one per entry in a scan file).

## Text mode (default)

When `encoding` is set (default `'utf-8'`), each element is a string of
space-separated values (or the separator specified by `sep`), prefixed with
the slave ID:

```
slave 1: 1234 5678 910 1112
slave 2: 0 1 0 1 0 0 1 1
```

Failed polls produce `None` in the list rather than raising an exception.

## Binary mode

When `encoding=None`, each element is a `bytes` object:

* **Registers** — each value packed as a 16-bit unsigned big-endian integer.
* **Coils / discrete inputs** — bits packed LSB-first into bytes (Modbus spec).

```python
reader = ModBusTCPReader(
    host='192.168.1.10',
    registers='0:3',
    encoding=None,      # return raw bytes
)
records = reader.read()  # e.g. [b'\x04\xd2\x16\x2e\x00\x00\x00\x00']
```

---

# See Also

* [Reading from Serial Ports]({{ "/serial_readers/" | relative_url }}) — SerialReader and PolledSerialReader
* [Introduction to Loggers]({{ "/intro_to_loggers/" | relative_url }}) — logger architecture overview
* [Logger Configuration Files]({{ "/logger_configuration_files/" | relative_url }}) — YAML configuration reference
* [OpenRVDAS Components]({{ "/components/" | relative_url }}) — full component listing