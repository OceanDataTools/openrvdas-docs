---
permalink: /cookbook/influxdb_shoreside_replication/
title: "InfluxDB Ship-to-Shore Replication"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

__[Note: ship-to-shore replication should only be arranged for non-restricted data!]__

This document describes how to setup OpenRVDAS and InfluxDB to support replicated of restricted and non-restricted data from ship to shore.

Once setup the exact same Grafana dashboards can be used on board and ashore.  Restricting shore-side access to individual sensors can be achieved simply by changing OpenRVDAS's mode. In this example access to the Seapath 330 (s330) and Gyro (gyr1) will periodically need to be restricted.

## OpenRVDAS Setup

### Mode setup
Need to add a `no_write+influx_restricted` mode that is identical to the unrestricted version with the exception of using a restricted version of the `net_reader-on+influx` logger config.
    
    ```
      no_write: &no_write_base
        gp02: gp02-net
        gyr1: gyr1-net
        hdas: hdas-net
        knud: knud-net
        mwx1: mwx1-net
        pco2: pco2-net
        s330: s330-net
        seap: seap-net
        svp1: svp1-net
        tsg1: tsg1-net
        tsg2: tsg2-net
        twnc: twnc-net
        net_reader: net_reader-on
        true_wind: true_wind-on
        snapshot: snapshot-on
    
      no_write+influx: &no_write_influx_base
        <<: *no_write_base
        net_reader: net_reader-on+influx
        true_wind: true_wind-on+influx
        snapshot: snapshot-on+influx
    
      no_write+influx_restricted:
        <<: *&no_write_influx_base
        net_reader: net_reader-on+influx_restricted
    ```

### Logger setup
Here are the restricted and non-restricted versions of the net_reader-on+influx logger configs.  The unrestricted version applies a `restricted: 'no'` tag to all data.  The restricted version does the same with except `restricted: 'yes'` for the `s330` and `gyr1` measurements.
    
    ```
      net_reader-on+influx: &net_reader_on_influx_base
        readers:
        - class: UDPReader
          kwargs:
            port: 6224
        transforms:
        - class: ParseTransform
          kwargs:
            metadata_interval: 10
            definition_path: test/NBP1406/devices/nbp_devices.yaml
        writers:
        - class: CachedDataWriter
          kwargs:
            data_server: localhost:8766
        - class: InfluxDBWriter
          kwargs:
            bucket_name: openrvdas
            tags: 
              restricted: 'no'
      
      net_reader-on+influx_restricted:
        <<: *net_reader_on_influx_base
        writers:
        - class: CachedDataWriter
          kwargs: 
            data_server: localhost:8766
        - class: InfluxDBWriter    
          kwargs:
            bucket_name: openrvdas
            tags:
              restricted:
                value: 'yes'
                filter: ['s330','gyr1']
                default: 'no'
    ```

## InfluxDB Setup

### Bucket setup

Create "non_restricted" bucket on ship's InfluxDB server, and give it a retention policy of 24h.  This bucket will store the measurements/fields that will be replicated shoreside.

### Task setup

Create the non_restricted task, setting it to run every second, querying all data where tag: `restricted == 'no'`.  The numberical parts of the retrieved data are averaged over 1s.  For the non-numerical data (boolean, strings) the last value is used. The processed data is saved to the `non_restricted` bucket.
 
    ```
    import "types"
    import "influxdata/influxdb/tasks"
    
    option task = {name: "non_restricted_task", every: 1s}
    
    data = () =>
        from(bucket: "openrvdas")
            |> range(start: tasks.lastSuccess(orTime: -task.every))
            |> filter(fn: (r) => r["restricted"] == "no")
    
    numeric =
        data()
            |> filter(
                fn: (r) =>
                    types.isType(v: r._value, type: "float") or types.isType(v: r._value, type: "int")
                        or
                        types.isType(v: r._value, type: "uint"),
            )
            |> aggregateWindow(every: task.every, fn: mean)
    
    nonNumeric =
        data()
            |> filter(
                fn: (r) =>
                    types.isType(v: r._value, type: "string") or types.isType(
                            v: r._value,
                            type: "bool",
                        ),
            )
            |> aggregateWindow(every: task.every, fn: last)
    
    union(tables: [numeric, nonNumeric])
        |> to(bucket: "non_restricted")
    ```

### Remote connection/replication setup

This part assumes the remote InfluxDB server is installed, running and accessible from the shipboard server. And, of course, that you use your own access tokens and ip addresses instead of the sample ones provided below.

__Local Server Information__
 - IP address: 161.35.96.48
 - InfluxDB Access Token: ```hvOVhxzaOVYBosyjBEAi4xK9uSwsudM9e-OXipBgiyAYIxlE8uSlwStFzrDqWIpCKBBD7Cz2wFxgAG8hU9yA```
 - Org ID: `484128927fd28af7`
 - Bucket ID for openrvdas : `293a647bad0b5a7c`
 - Bucket ID for non_restricted: `40bd5db8108cc867`
 
__Remote Server Information__
 - IP address: 162.243.201.175
 - InfluxDB Access Token: ``Ygukgz1pBo6A8vFtdQ5-n7Wj-vHUB1a90m_Ybxzv6UXQDdPoK6e4wAfAEx_p6RkriVo2vOtKPbYH2e8mAcPww``
 - Org ID: `6f2573a909dc163c`
 - Target Bucket Name: `openrvdas`

Set the INFLUX_TOKEN environmental variable to the InfluxDB token for the local server:

```
export INFLUX_TOKEN=hvOVhxzaOVYBosyjBaEAi4xK9uSwsudM9e-OXipBgiyAYIxlE8uSlwStFzrDqWIp_CKBBD7Cz2wFxgAG8hU9yA
```

Create/Save the connection for the remote instance of InfluxDB:

```
influx remote create --name 'openrvdas_remote' \
--org-id 484128927fd28af7 \
--token 'hvOVhxzaOVYBosyjBaEAi4xK9uSwsudM9e-OXipBgiyAYIxlE8uSlwStFzrDqWIp_CKBBD7Cz2wFxgAG8hU9yA' \
--remote-url 'http://162.243.201.175:8086' \
--remote-org-id 6f2573a909dc163c \
--remote-api-token 'Ygukgz1pBo6A8vFtdQ5-n7Wj-vHUB190m_Ybxzv6UXQDdPoK6e_4wAfAEx_p6RkriVo2vOtKPbYH2e8mAcPww' --allow-insecure-tls
```

Example response:

```
ID      Name      Org ID      Remote URL      Remote Org ID   Allow Insecure TLS
0e739b8befc31000  openrvdas_remote  484128927fd28af7  http://162.243.201.175:8086 6f2573a909dc163c  true
```

List the available remote connections:

```
influx remote list --org-id 484128927fd28af7
```

Create the replication layer, the local-bucket-id is for the 'non-restricted' bucket:
    
```
influx replication create --name Ship_to_Shore \
--remote-id 0e739b8befc31000 \
--local-bucket-id 40bd5db8108cc867  --org-id 484128927fd28af7 \
--remote-bucket openrvdas
```

Example response:
    
```
ID      Name    Org ID      Remote ID   Local Bucket ID   Remote Bucket ID  Remote Bucket Name  Remaining Bytes to be Synced  Current Queue Bytes on Disk Max Queue Bytes Latest Status Code  Drop Non-Retryable Data
0e73bb64059f5000  Ship_to_Shore 484128927fd28af7  0e739b8befc31000  40bd5db8108cc867        openrvdas   0       0     67108860  0     false
```

That's it.  At this point the non-restricted data should appear on the shore-side InfluxDB server.  It's worth verifying the data is arriving before continuing to the next section.

## Grafana Setup

1. Setup Grafana on the shipboard and shoreside servers.  Setup the local InfluxDB instance as a data source on each of the servers.

2. Build the dashboard on the ship's Grafana server. Ensure the Flux queries have `createEmpty: false`:

    ```
    from(bucket: "openrvdas")
      |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
      |> filter(fn: (r) => r["_measurement"] == "gyr1")
      |> filter(fn: (r) => r["_field"] == "Gyr1HeadingTrue")
      |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
      |> yield(name: "mean")
    ```
    
     **NOTE:** *Turning off legends and setting the palette to single color will make the graphs look cleaner.*

3. Retrieve the JSON model for the Dashboard on the shipboard Grafana server:
   - Go to Dashboard Settings --> JSON Model.
   - Copy the JSON object.

4. Open Grafana on the shoreside server.
   - Create new dashboard
   - Select Import Model
   - Paste JSON object into textarea
   - Click "Load" button
   - Click "Import" button

## Final checks

If everything is setup correctly the shipboard and shore-side dashboards should look exactly the same while OpenRVDAS is in `no_write+influx` mode.  Switching to `no_write+influx_restricted` mode will pause the data feed visualized as a gap on the shore-side dashboard graph.  Switching back to `no_write+influx` mode will restored data feed; causing the dashboard to resume displaying new data.
