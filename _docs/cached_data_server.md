---
permalink: /cached_data_server/
title: "Cached Data Server"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

The [CachedDataServer](https://github.com/OceanDataTools/openrvdas/blob/master/server/cached_data_server.py) accepts timestamped field:value data, holds it in an in-memory cache, and serves it to clients over WebSockets. It is used to feed display widgets, to provide intermediate caching for derived-data transforms, and as a general-purpose data bus between OpenRVDAS components.

In the default OpenRVDAS installation a CachedDataServer is already running and listening for WebSocket connections on port **8766**.

---

## Running the Server

### Default installation

The default installation uses `supervisord` to start and maintain the server:

```
server/cached_data_server.py --port 8766 \
    --disk_cache /var/tmp/openrvdas/disk_cache \
    --max_records 86400 -v
```

This serves WebSocket connections on port 8766, retains at most 86400 records per field (one day at 1 Hz), and maintains a disk cache at `/var/tmp/openrvdas/disk_cache` that is used to warm the in-memory cache on restart. It does **not** listen on a UDP port — all data arrives via WebSocket `publish` messages.

Stdout and stderr are written to `/var/log/openrvdas/cached_data_server.std{out,err}`. The full supervisord spec is in `/etc/supervisor/conf.d/openrvdas.conf` (Ubuntu) or `/etc/supervisord.d/openrvdas.ini` (CentOS/Redhat).

To start, stop, or restart the server, use the supervisord web interface at [http://openrvdas:9001](http://openrvdas:9001) or the command line:

```
root@openrvdas:~# supervisorctl
cached_data_server               RUNNING   pid 5641, uptime 1:35:54
logger_manager                   RUNNING   pid 5646, uptime 1:35:53

supervisor> stop cached_data_server
cached_data_server: stopped

supervisor> start cached_data_server
cached_data_server: started

supervisor> exit
```

### Manual invocation

You can also run the server directly. If you are running a LoggerManager, pass `--start_data_server` to have it start its own CachedDataServer automatically.

For a standalone server that also listens for data on a UDP port:

```
server/cached_data_server.py \
  --udp 6225 \
  --port 8766 \
  --disk_cache /var/tmp/openrvdas/disk_cache \
  --back_seconds 3600 \
  --cleanup_interval 60 \
  -v
```

### Server command-line flags

| Flag | Default | Description |
|---|---|---|
| `--port` | _(required)_ | WebSocket port to serve clients on |
| `--udp` | _(none)_ | Comma-separated UDP port(s) to listen for incoming data on. Prefix with a multicast group to use multicast, e.g. `239.0.0.1:6225` |
| `--disk_cache` | _(none)_ | Directory for the disk-backed cache. On restart, data is reloaded from here to warm the in-memory cache |
| `--back_seconds` | `86400` | Maximum age (seconds) of data to retain |
| `--max_records` | `2880` | Maximum number of records to retain per field. Set to `0` for unlimited |
| `--min_back_records` | `64` | Minimum number of records to keep per field even when purging old data |
| `--cleanup_interval` | `60` | How often (seconds) to purge old data and flush the disk cache |
| `--interval` | `0.5` | How often (seconds) the server pushes updates to subscribed clients |

---

## The WebSocket Protocol

All interaction with the CachedDataServer — reading and writing — happens over a single WebSocket connection. Connect to `ws://host:8766` and exchange JSON messages. Every message you send has a `"type"` field; every response from the server has `"type"`, `"status"` (HTTP-style, e.g. `200`), and `"data"` fields.

### `fields` — list available fields

```json
{"type": "fields"}
```

Returns a list of all field names currently held in the cache:

```json
{"type": "data", "status": 200, "data": ["S330CourseTrue", "S330SpeedKt", ...]}
```

### `describe` — get field metadata

```json
{"type": "describe", "fields": ["S330CourseTrue", "S330SpeedKt"]}
```

Returns a dict of metadata (units, description, device, etc.) for each named field. Omit `"fields"` to get metadata for every field in the cache:

```json
{
  "type": "data", "status": 200,
  "data": {
    "S330CourseTrue": {"description": "True course", "units": "degrees", ...},
    "S330SpeedKt":   {"description": "Speed in knots", "units": "kt", ...}
  }
}
```

### `subscribe` — stream field updates

Subscribing is a two-step loop: send a `subscribe` message once to register interest, then send `ready` repeatedly to receive successive batches of updates.

```json
{
  "type": "subscribe",
  "fields": {
    "S330CourseTrue": {"seconds": 30},
    "S330SpeedKt":    {"seconds": 0},
    "S330HeadingTrue":{"seconds": -1}
  }
}
```

The `"seconds"` value controls how much historical data is returned in the first response:

| `seconds` value | Meaning |
|---|---|
| `0` | Only new values that arrive after the subscription |
| `-1` | The single most recent value, then all future new values |
| `N` (positive) | Up to N seconds of historical data, then all future new values |

If `"seconds"` is omitted, `0` is used.

**`back_records`** (optional, per-field): guarantee a minimum number of historical records regardless of the `seconds` window. Useful when data arrives irregularly:

```json
{"S330CourseTrue": {"seconds": 60, "back_records": 10}}
```

**`interval`** (optional, top-level): override the server's default push interval (seconds). Useful for low-bandwidth clients or slow-changing data:

```json
{
  "type": "subscribe",
  "fields": {"S330CourseTrue": {"seconds": 0}},
  "interval": 15
}
```

**Wildcards**: field names may contain `*` to match multiple fields:

```json
{"type": "subscribe", "fields": {"S330*": {"seconds": -1}}}
```

**`format`** (optional, top-level): controls the shape of the `data` payload in each response.

`"field_dict"` (default) — a dict mapping each field name to a list of `[timestamp, value]` pairs:

```json
{
  "S330CourseTrue": [[1714000000.0, 219.6], [1714000001.0, 219.7], ...],
  "S330SpeedKt":   [[1714000000.0, 8.9],   [1714000001.0, 8.9],   ...]
}
```

`"record_list"` — collated by timestamp into a list of DASRecord-like dicts. Useful when processing records in time order across multiple fields:

```json
{
  "type": "subscribe",
  "fields": {"S330CourseTrue": {"seconds": 30}, "S330SpeedKt": {"seconds": 30}},
  "format": "record_list"
}
```

Response `data`:

```json
[
  {"timestamp": 1714000000.0, "fields": {"S330CourseTrue": 219.6, "S330SpeedKt": 8.9}},
  {"timestamp": 1714000001.0, "fields": {"S330CourseTrue": 219.7, "S330SpeedKt": 8.9}},
  ...
]
```

### `ready` — acknowledge and receive the next batch

After the initial `subscribe` response, send `ready` each time you are prepared to receive the next update:

```json
{"type": "ready"}
```

The server responds with a `data` message containing all field values that have arrived since the previous `ready`. This back-pressure mechanism prevents a slow client from being overwhelmed with buffered data.

### `publish` — write data into the cache

Any WebSocket client can push data into the cache using a `publish` message:

```json
{
  "type": "publish",
  "data": {
    "timestamp": 1555468528.452,
    "fields": {
      "field_1": "value_1",
      "field_2": "value_2"
    }
  }
}
```

This is the mechanism used by the [CachedDataWriter](https://github.com/OceanDataTools/openrvdas/blob/master/logger/writers/cached_data_writer.py) component to feed data into the server.

---

## Reading from the Server

### listen.py

[`logger/listener/listen.py`](https://github.com/OceanDataTools/openrvdas/blob/master/logger/listener/listen.py) accepts a `--cached_data` argument that subscribes to one or more fields and prints received records to stdout. Useful for quick inspection and for piping CDS data into other command-line tools.

```
logger/listener/listen.py --cached_data field_1,field_2,field_3
```

Connects to `localhost:8766` by default. To target a different host or port, append `@host:port`:

```
logger/listener/listen.py --cached_data S330CourseTrue,S330SpeedKt@192.168.1.10:8766
```

All subscribed fields use `seconds: 0` — only values that arrive after the subscription starts are returned. The `--cached_data` flag can be combined with other `listen.py` transforms and writers in the usual way:

```
logger/listener/listen.py \
  --cached_data S330CourseTrue,S330SpeedKt \
  --transform_prefix vessel \
  --write_logfile /var/tmp/log/s330
```

### Interactive exploration

For ad-hoc queries or protocol debugging, any interactive WebSocket client works. Two popular command-line options are [`wscat`](https://github.com/websockets/wscat) (Node.js) and [`websocat`](https://github.com/vi/websocat) (Rust).

List all cached fields:

```
$ wscat -c ws://localhost:8766
Connected (press CTRL+C to quit)
> {"type":"fields"}
< {"type": "data", "status": 200, "data": ["S330CourseTrue", "S330SpeedKt", ...]}
```

Get the most recent value of a field and exit:

```
$ echo '{"type":"subscribe","fields":{"S330CourseTrue":{"seconds":-1}}}' \
  | websocat ws://localhost:8766
```

### CachedDataReader in a YAML config file

[`CachedDataReader`](https://github.com/OceanDataTools/openrvdas/blob/master/logger/readers/cached_data_reader.py) is the standard component for pulling data from the CDS inside a logger configuration.

```yaml
readers:
  class: CachedDataReader
  kwargs:
    data_server: localhost:8766
    subscription:
      fields:
        S330CourseTrue:
          seconds: 0
        S330SpeedKt:
          seconds: -1
        S330HeadingTrue:
          seconds: 60
```

All subscription options from the [WebSocket protocol](#subscribe--stream-field-updates) — wildcards, `back_records`, `interval`, `format` — are available inside the `subscription` dict.

As a convenience, `fields` may be given as a list instead of a dict; all fields are then subscribed with `seconds: 0`:

```yaml
readers:
  class: CachedDataReader
  kwargs:
    data_server: localhost:8766
    subscription:
      fields:
        - S330CourseTrue
        - S330SpeedKt
        - S330HeadingTrue
```

**CachedDataReader parameters:**

| Parameter | Default | Description |
|---|---|---|
| `data_server` | `localhost:8766` | Host and port of the CachedDataServer |
| `subscription` | _(required)_ | Subscription dict (see above) |
| `bundle_seconds` | `0` | If > 0, accumulate records for this many seconds and return them as a list |
| `return_das_record` | `False` | If `True`, wrap results in `DASRecord` objects |
| `data_id` | `None` | `data_id` to assign to returned `DASRecord` objects (requires `return_das_record=True`) |
| `use_wss` | `False` | Connect using secure WebSockets (`wss://`) |
| `check_cert` | `False` | Verify the server's TLS certificate; may be a path to a `.pem` file |

Example — read two fields and write them to a logfile:

```yaml
readers:
  class: CachedDataReader
  kwargs:
    data_server: localhost:8766
    subscription:
      fields:
        S330CourseTrue:
          seconds: 0
        S330SpeedKt:
          seconds: 0
writers:
  class: LogfileWriter
  kwargs:
    filebase: /var/tmp/log/s330_derived
```

### CachedDataReader in Python

```python
from logger.readers.cached_data_reader import CachedDataReader

subscription = {
    'fields': {
        'S330CourseTrue': {'seconds': 30},
        'S330SpeedKt':    {'seconds': -1},
    }
}

reader = CachedDataReader(subscription=subscription, data_server='localhost:8766')

while True:
    record = reader.read()  # blocks until data arrives
    print(record)
    # {'timestamp': ..., 'fields': {'S330CourseTrue': ..., 'S330SpeedKt': ...}}
```

To return `DASRecord` objects instead of plain dicts:

```python
reader = CachedDataReader(
    subscription=subscription,
    data_server='localhost:8766',
    return_das_record=True,
    data_id='s330_consumer',
)
record = reader.read()  # returns a DASRecord
```

To accumulate a time window of records before returning:

```python
reader = CachedDataReader(
    subscription=subscription,
    data_server='localhost:8766',
    bundle_seconds=5,
)
records = reader.read()  # returns a list of dicts
```

### External Python (asyncio + websockets)

Any Python program can talk to the CachedDataServer directly using the `websockets` library:

```python
import asyncio
import json
import websockets

async def read_fields():
    async with websockets.connect('ws://localhost:8766') as ws:
        # Subscribe
        await ws.send(json.dumps({
            'type': 'subscribe',
            'fields': {
                'S330CourseTrue': {'seconds': 60},
                'S330SpeedKt':    {'seconds': -1},
            }
        }))
        await ws.recv()  # discard subscribe acknowledgement

        # Poll for updates
        while True:
            await ws.send(json.dumps({'type': 'ready'}))
            response = json.loads(await ws.recv())
            if response.get('status') == 200:
                for field, values in response.get('data', {}).items():
                    for timestamp, value in values:
                        print(f'{field}: {value} @ {timestamp}')
            await asyncio.sleep(1)

asyncio.run(read_fields())
```

One-shot query for the most recent value of all fields matching a pattern:

```python
async def latest_values(pattern='S330*'):
    async with websockets.connect('ws://localhost:8766') as ws:
        await ws.send(json.dumps({
            'type': 'subscribe',
            'fields': {pattern: {'seconds': -1}},
        }))
        await ws.recv()  # discard subscribe acknowledgement
        await ws.send(json.dumps({'type': 'ready'}))
        response = json.loads(await ws.recv())
        return response.get('data', {})

data = asyncio.run(latest_values())
```

### JavaScript (browser)

The OpenRVDAS `WidgetServer` class in [`display/js/widgets/widget_server.js`](https://github.com/OceanDataTools/openrvdas/blob/master/display/js/widgets/widget_server.js) handles the subscribe/ready loop automatically and dispatches incoming data to a list of display widgets:

```javascript
var widgets = [
  new TextWidget('course_div', {'S330CourseTrue': {'seconds': 0}}, 'Degrees'),
  new TextWidget('speed_div',  {'S330SpeedKt':    {'seconds': 0}}, 'kt'),
];

var server = new WidgetServer(widgets, 'ws://localhost:8766');
server.serve();
```

For custom pages that don't use the widget framework, the raw browser WebSocket API works the same way:

```javascript
const ws = new WebSocket('ws://localhost:8766');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    fields: {
      S330CourseTrue: {seconds: 60},
      S330SpeedKt:    {seconds: -1},
    },
    format: 'record_list',
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'data' && msg.status === 200) {
    // msg.data is an array of {timestamp, fields} objects
    console.log(msg.data);
  }
  ws.send(JSON.stringify({type: 'ready'}));
};
```

---

## Writing to the Server

### CachedDataWriter in a YAML config file

[`CachedDataWriter`](https://github.com/OceanDataTools/openrvdas/blob/master/logger/writers/cached_data_writer.py) is the standard component for pushing data into the CDS from a logger pipeline:

```yaml
writers:
  class: CachedDataWriter
  kwargs:
    data_server: localhost:8766
```

It accepts `DASRecord` or dict-format records and forwards them to the server via WebSocket `publish` messages. If the connection is lost, it buffers up to `max_backup` records (default: 86400) locally until it can reconnect.

### UDP input

If the server is started with one or more `--udp` ports, it will also accept JSON-encoded records broadcast on those ports:

```
server/cached_data_server.py --port 8766 --udp 6225
```

The default supervisord installation does **not** enable UDP input. To enable it, uncomment the relevant line in `scripts/start_openrvdas.sh`:

```bash
#DATA_SERVER_LISTEN_ON_UDP='--udp $DATA_SERVER_UDP_PORT'
```

### Direct Python API

Code that instantiates a `CachedDataServer` object directly (rather than connecting to a running server) can call `cache_record()` directly:

```python
from server.cached_data_server import CachedDataServer

server = CachedDataServer(port=8766)
server.cache_record({
    'timestamp': time.time(),
    'fields': {'field_1': 'value_1', 'field_2': 'value_2'}
})
```

---

## Input Data Formats

Whether data arrives via UDP, WebSocket `publish`, or direct `cache_record()` call, the server expects records in one of the following formats.

**Standard format** — a dict with an optional `data_id` and `timestamp`, and a mandatory `fields` key:

```json
{
  "data_id": "s330",
  "timestamp": 1555468528.452,
  "fields": {
    "S330CourseMag":  244.29,
    "S330CourseTrue": 219.61,
    "S330SpeedKt":    8.9
  }
}
```

`data_id` is optional. `timestamp` is optional — `time.time()` is used if absent.

**Pre-timestamped format** — field values may themselves be lists of `(timestamp, value)` pairs, in which case the top-level `timestamp` is ignored:

```json
{
  "fields": {
    "S330CourseMag":  [[1555468527.1, 244.1], [1555468528.4, 244.29]],
    "S330CourseTrue": [[1555468527.1, 219.5], [1555468528.4, 219.61]]
  }
}
```

**With metadata** — a record may include a `metadata` key. The server extracts the `fields` dict inside it and caches it as per-field metadata, which is then returned by `describe` requests. This metadata is emitted at intervals by `RecordParser`/`ParseTransform` when `metadata_interval` is set:

```json
{
  "data_id": "s330",
  "fields": {"S330CourseMag": 244.29, "S330CourseTrue": 219.61},
  "metadata": {
    "fields": {
      "S330CourseMag":  {"description": "Magnetic course", "units": "degrees", ...},
      "S330CourseTrue": {"description": "True course",     "units": "degrees", ...}
    }
  }
}
```

---

## Quick Reference

**Reading:**

| Method | When to use |
|---|---|
| `listen.py --cached_data` | Command-line inspection; piping into other tools |
| `wscat` / `websocat` | Interactive protocol debugging |
| `CachedDataReader` in YAML | Reading CDS data inside a logger or derived-data pipeline |
| `CachedDataReader` in Python | Scripted consumers within the OpenRVDAS codebase |
| `asyncio` + `websockets` | External Python programs or services |
| JavaScript `WidgetServer` | Browser display pages using the built-in widget framework |
| Raw `WebSocket` (JS/other) | Custom browser pages or other language bindings |

**Writing:**

| Method | When to use |
|---|---|
| `CachedDataWriter` in YAML | Feeding the CDS from a logger pipeline |
| WebSocket `publish` message | Any WebSocket client pushing data directly |
| `--udp` port | Legacy UDP broadcast from instruments or other processes |
| `cache_record()` in Python | In-process use when directly instantiating a `CachedDataServer` |