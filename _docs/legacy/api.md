---
permalink: /api_reference/
title: "API Reference"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
The **[OpenRVDAS API Reference]({{ "/api/" | relative_url }})** is the
automatically generated documentation for every OpenRVDAS logger
component and server module: class signatures, constructor arguments,
method docstrings and, where useful, the source itself.

It is the same documentation that is installed alongside the code. On
a machine that already has OpenRVDAS, open
`openrvdas/docs/html/index.html` in a browser to read it with no
network connection.

## What's covered

The reference documents the Python packages that make up a running
OpenRVDAS installation:

| Section | Contents |
| --- | --- |
| [Readers]({{ "/api/openrvdas/logger/readers.html" | relative_url }}) | Components that acquire data: serial ports, UDP and TCP sockets, HTTP, files, databases, Redis, MQTT, Modbus, the cached data server and Sealog. |
| [Transforms]({{ "/api/openrvdas/logger/transforms.html" | relative_url }}) | Components that timestamp, parse, filter, reformat, compute or otherwise manipulate records in flight. |
| [Writers]({{ "/api/openrvdas/logger/writers.html" | relative_url }}) | Components that deliver records to files, network sockets, the cached data server, InfluxDB, Grafana Live, other databases, email, Sealog and the logger manager. |
| [Utils]({{ "/api/openrvdas/logger/utils.html" | relative_url }}) | Shared helpers: `DASRecord`, timestamps, the record parser and its format types, `validate_config`, `simulate_data`. |
| [Listener]({{ "/api/openrvdas/logger/listener.html" | relative_url }}) | The machinery behind `listen`, which assembles a logger from a configuration and runs it. |
| [Server]({{ "/api/openrvdas/server.html" | relative_url }}) | The logger manager, the cached data server, `lmcmd` and the server APIs. |

## When to use it

The reference is where you go once you know which component you want
and need its exact arguments and defaults. To find out *which*
component you want, start from the Guide's
[Component Catalog]({{ "/guide/reference/#component-catalog" | relative_url }}),
which lists every reader, transform and writer by purpose with the
parameters you'll usually set, and links each one to its page here.
For how the components fit together, see
[How It Works]({{ "/guide/introduction/#how-it-works" | relative_url }})
and
[Creating and Testing Loggers]({{ "/guide/your-vessel/#creating-and-testing-loggers" | relative_url }}).

Every page in the reference has a search box that indexes the full API
across all modules, and the left-hand sidebar lists the classes and
methods on the page you're reading. The site search at the top of
*this* page covers the documentation site only, so use the reference's
own search when you're looking for a class or argument name.

## How it's generated

The reference is built with [pdoc](https://pdoc.dev/) from the
docstrings in the OpenRVDAS source tree, by `docs/generate_html_docs.sh`
in the [OpenRVDAS repository](https://github.com/OceanDataTools/openrvdas),
and the result is committed to the repository under `docs/html/`. A
workflow there regenerates it whenever logger or server code changes
on the `dev` branch and opens a pull request with the result; once
that is merged and `dev` is released to `master`, this site picks up
the new version the next time it is rebuilt. So the reference here
describes the current release, and can lag `dev` by a release.

Because it is generated from source, the reference reflects the code
rather than this site: if a component's docstring is thin, the
reference is thin too. Improvements are welcome as pull requests
against the docstrings themselves.
