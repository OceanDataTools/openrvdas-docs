---
permalink: /about/
title: "About"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---
OpenRVDAS ("Open Research Vessel Data Acquisition System")  is a software framework used for assembling custom data acquisition systems targeted, as its name suggests, marine research vessels. Target audiences are vessel operators and operators of other science-related platforms that have the need to record streaming data. OpenRVDAS is capable of reading data records from serial ports and network-aware sensors, optionally modifying those data records and streaming either the result to one or more destinations, including logfiles, network ports, databases, etc.

OpenRVDAS is designed to be modular and extensible, relying on simple composition of Readers, Transforms and Writers to achieve the needed datalogging functionality.

OpenRVDAS has been written from a clean slate based on experience drawn from developing code on behalf of the US Antarctic Program and Antarctic Support Contract, and heavily informed by discussions and collaboration with members of the [RVTEC community](https://www.unols.org/committee/research-vessel-technical-enhancement-committee-rvtec).

## Design Philosophy

Every ship will have different requirements, so no single system can hope to accommodate everyone's needs. In addition, those requirements will change from mission to mission and year to year, so no fixed system will be optimal for any length of time.

Because of this, instead of a turnkey system, we have focused on designing and building an architecture that allows easy assembly of small, modular components into whatever system is needed in a given situation.

## Software Requirements

OpenRVDAS loggers have been tested on most POSIX-compatible systems running Python 3.6 and above (Linux, MacOS, Windows). Web console monitoring and control are supported for MacOS and most Linux variants (Ubuntu, Red Hat, CentOS, Rocky, Raspbian) and may work on others. The Django-based web interface is designed to be compatible with most modern browsers.

The project code repository is at [https://github.com/oceandatatools/openrvdas](https://github.com/oceandatatools/openrvdas), and is made available under the [MIT Open Source License](https://opensource.org/license/mit).

## Where to start?
* [OpenRVDAS Quickstart](/quickstart/) if you want to just grab the code and poke around with basic loggers as quickly as possible.
* [GUI Quickstart](quickstart_gui/) if you want to play with the web-based interface.

Other relevant documents are:

* [The Listener Script - listen.py](/listen_py/) - how to use OpenRVDAS's core utility script
* [Logger Configuration Files](/logger_configuration_files/) - how to define configuration files to simplify running loggers with listen.py
* [OpenRVDAS Components](/components/) - what components exist and what they do
* [Simulating Live Data](/simulating_live_data/) - using the simulate_data.py script to simulate a live system using stored data for development and testing
* [Grafana/InfluxDB-based Displays](/grafana_displays/) - an introduction to using InfluxDB and Grafana for displaying data
* [Parsing](/parsing/) - how to work with the included RecordParser to turn raw text records into structured data fields
* [Security assumptions](/security/) - the (rather naive) security assumptions made about the environment in which OpenRVDAS runs.

OpenRVDAS is a part of the [Ocean Data Tools project](http://oceandata.tools).
