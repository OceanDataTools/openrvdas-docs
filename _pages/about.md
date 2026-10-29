---
permalink: /about/
title: "About"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
OpenRVDAS, the Open Research Vessel Data Acquisition System, is a
software framework for building data acquisition systems. It is written
for the operators of oceanographic research vessels, and for anyone
else who runs a platform full of instruments and needs to record what
they say. OpenRVDAS:
* Reads data records from serial ports and other machine-defined ports, from network-connected sensors, databases and logfiles as desired
* Optionally performs processing on them on the way through, adding timestamps, parsing them into named fields, computing derived
values, and finally
* Streams the results to wherever they need to go: logfiles, network ports, databases, and live displays.

Rather than a finished application, OpenRVDAS is best viewed as an integrated toolkit of small
components - Readers, Transforms and Writers - with tools that let you "snap them together" to meet your vessel's requirements, and run them using a simple, user-friendly interface .

## Design Philosophy

Every ship has different requirements, and those requirements change
from mission to mission and from year to year. No single turnkey system
can serve everyone, and no fixed system stays right for long.

Rather than being a monolithic system, OpenRVDAS provides an architecture for
assembling small, modular pieces into whatever is needed in a given
situation, and for changing that assembly when the situation changes.
A data pipeline can be built using a few lines of YAML naming its components; new instruments can be configured with a few lines of YAML defining their parameters. Entirely new modules and functionality can be added with small Python scripts that are seamlessly absorbed into system as a whole.

## Origins

OpenRVDAS began in 2017, written from a clean slate on the basis of
experience working with legacy data acquisition code for the United States
Antarctic Program under the Antarctic Support Contract. Its design has
been heavily informed by discussion and collaboration with members of
the [RVTEC community](https://www.unols.org/committee/research-vessel-technical-enhancement-committee-rvtec),
the technical staff of the US academic research fleet. It is in
production use on research vessels around the world and under active
development.

OpenRVDAS is part of the [Ocean Data Tools](https://oceandata.tools)
project, alongside Sealog, the shipboard event logger it works with, and OpenVDM, a package for post-cruise vessel data management and distribution.

## Requirements and License

The complete OpenRVDAS system runs on Linux (Ubuntu 22.04 and later, Debian 12 including
Raspberry Pi OS, and RHEL, Rocky and AlmaLinux 9 and later) and macOS, and needs Python 3.11 or
newer, which the installer provides where the system's is older. Ubuntu, in its latest release, is
the preferred distribution. Most modules, and the `listen` script that assembles and runs them into loggers, also run under Windows via Cygwin, however the logger manager and other servers have not been adapted and tested under that environment.

While stripped-down installations of OpenRVDAS can run on systems as minimal as a Raspberry Pi Zero, for the full system we recommend a machine with at least 4GB of RAM. An installation serving both OpenRVDAS and accompanying InfluxDB (database) and Grafana (display) servers should have at least 2 cores and 8 GB of RAM.

For full details, including installation instructions, please refer to the Guide's
[Installation]({{ "/guide/installation/" | relative_url }}) section.

The code is at
[github.com/OceanDataTools/openrvdas](https://github.com/OceanDataTools/openrvdas),
under the [MIT License](https://opensource.org/license/mit). Bug
reports and pull requests are welcome there.

## Where to Start

The [OpenRVDAS Guide]({{ "/guide/introduction/" | relative_url }}) is
the manual: one document, front to back, from what OpenRVDAS is to how
to fix it when it misbehaves. Its introduction has a
[reading guide]({{ "/guide/introduction/#how-to-read-this-guide" | relative_url }})
that points you to the right section for your situation, whether you're
standing watch on a vessel that already runs OpenRVDAS, installing it
on a new machine, or bringing it up on your own vessel. If you'd rather
see it working first, the
[tutorial]({{ "/guide/nbp-tutorial/" | relative_url }}) runs a complete
simulated vessel on your own machine.
