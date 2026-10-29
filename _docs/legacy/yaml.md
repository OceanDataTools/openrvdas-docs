---
permalink: /yaml/
title: "A Short Introduction to YAML"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

Every OpenRVDAS configuration file — logger configurations, cruise
definitions, device type definitions — is written in YAML. YAML is a format
for writing down structured data in a way that stays readable to humans; the
full YAML specification is quite powerful, but you only need to learn a small
part of it to understand and work with OpenRVDAS configuration files with
confidence.

## Two building blocks

Everything in a YAML file is built out of just two things.

**Key-value pairs**, written as `key: value` (note the space after the colon):

```yaml
class: SerialReader
baudrate: 9600
port: /dev/ttyr15
```
A set of key-value pairs is often referred to as a mapping, or a dictionary,
or dict for short, depending on the context - they all mean the same thing.

**Lists**, written as lines beginning with a dash and a space:

```yaml
- contrib/logger_templates/serial_logger_template.yaml
- contrib/logger_templates/parse_data_logger_template.yaml
```

That is essentially it. Everything else is these two, nested inside each
other. Lists can be lists of key-value pairs, and key-value pairs may have
lists (of other key-value pairs, even!) as their elements.

## Indentation shows what belongs to what

YAML has no braces or brackets to mark where a section starts and stops.
Instead, **indentation** does that job: a line indented under another line
belongs to it.

```yaml
cruise:
  id: NBP1406
  start: '2019-07-01'
  end: '2019-12-31'
```

Here `cruise` is a key, and its value is the subordinate dictionary of
key-value pairs enumerated on the three indented lines beneath it. We would
read this as "`cruise` is a dictionary containing `id`, `start` and `end`."

Three rules keep this out of trouble:

1. **Indent with spaces, never tabs.** A tab character is illegal in YAML
   indentation and will produce a parse error. Configure your editor to insert
   spaces when you press Tab.
2. **Two spaces per level** is the OpenRVDAS convention. What matters is that
   items at the same level line up in the same column.
3. **Sibling items must be indented identically.** If `start` sits two spaces
   in and `end` sits three, the file is either an error or means something you
   did not intend.

Lists nest the same way, and a list item can itself be a dictionary. This
pattern — a list of dashes, each introducing a small block — appears throughout
OpenRVDAS configs:

```yaml
transforms:
  - class: TimestampTransform
  - class: PrefixTransform
    kwargs:
      prefix: gyr1
```

That says: `transforms` is a list of two dictionaries; the first has a single key
(`class`), the second has two (`class` and `kwargs`), and the value of `kwargs`
is itself a dictionary containing `prefix`. Note that the `kwargs` line is
indented to line up with the `class` above it, marking both as part of the
*same* list item — a dash starts a new item, so alignment is what keeps them
together.

## Values, and when to quote them

Most values need no quotes. Paths, hostnames and component names are all fine
bare:

```yaml
port: /dev/ttyr15
udp_destination: 255.255.255.255
filebase: /var/tmp/log/NBP1406/gyr1/raw/NBP1406_gyr1
```

YAML also interprets some unquoted values as types rather than text:

```yaml
baudrate: 9600      # a number
port: 6224          # a number
flush: true         # a boolean, not the word "true"
name: null          # an empty value
```

Quotes matter in three situations:

- **When you want a number-like or boolean-like value treated as text.** Dates
  are the classic case, which is why cruise metadata quotes them:
  `start: '2019-07-01'`. Left bare, YAML converts that to a date object.
  Version-like strings and values with leading zeros want quotes too.
- **When the value contains a colon followed by a space, or starts with a
  special character** such as `#`, `*`, `&`, `{`, or `[`. These have meaning to
  YAML, and quoting removes the ambiguity.
- **When the value is empty but must not be null**, written as `''`.

Single and double quotes both work. Double quotes process backslash escapes
like `\n`; single quotes take the text literally, which makes them the safer
default for paths and regular expressions.

## Comments

Anything from a `#` to the end of the line is a comment, ignored by the parser.
OpenRVDAS config files use them heavily, both for explanation and for banner
lines that separate sections:

```yaml
###########################################################
# Global variables - can be overridden by individual loggers
variables:
  cruise: NBP1406
  raw_udp_port: 6224  # comments can also follow a value
```

## Putting all it together

With those rules, a complete logger configuration is fully readable:

```yaml
readers:                        # one reader, given as a single-item list
  - class: SerialReader
    kwargs:                     # arguments passed to SerialReader
      baudrate: 9600
      port: /dev/ttyr15
transforms:                     # applied in series, top to bottom
  - class: TimestampTransform   # no kwargs needed for this one
  - class: PrefixTransform
    kwargs:
      prefix: gyr1
writers:                        # one writer, given as a single-item list
  - class: LogfileWriter
    kwargs:
      filebase: /var/tmp/log/gyr1
```

Read it as: three top-level keys, each holding a list of components, where each
component is a dictionary describing its class and arguments. The
[Logger Configuration Files]({{ "/logger_configuration_files/" | relative_url }})
page explains what those components do; the
[Cruise Definition Files]({{ "/cruise_definition_files/" | relative_url }})
page builds larger files out of the same pieces.

## Mistakes that bite newcomers

| Symptom | Cause |
| --- | --- |
| Parse error on a line that looks fine | A tab character somewhere in the indentation. Most editors can be set to show invisible characters. |
| A setting seems to be ignored | It is indented under the wrong parent, so it is attached to the wrong component. |
| `kwargs` treated as a separate list item | A stray `-` before it, or indentation that does not line up with the `class` it belongs to. |
| A value arrives as the wrong type | An unquoted date, a `yes`/`no` read as a boolean, or a leading zero stripped from a number. |
| One of two identical keys silently disappears | Duplicate keys at the same level — the last one wins. |
| Error pointing at a `:` inside a value | An unquoted value containing `: `, which YAML reads as a new key. |

A missing space after the colon (`port:6224`) is also a common typo. It makes
the whole thing a single text value rather than a key and a value.

## Checking your work

Do not guess — OpenRVDAS ships a validator that checks both YAML syntax and
whether the structure makes sense as an OpenRVDAS configuration:

```bash
validate_config my_logger_config.yaml
```

To check syntax alone, any YAML parser will do:

```bash
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" my_config.yaml
```

Silence means the file parsed. Most editors also have a YAML mode that flags
indentation problems as you type, which catches the majority of these errors
before you ever run anything.

## One last thing

JSON is a subset of YAML, so a valid JSON file is also a valid YAML file. You
may occasionally see OpenRVDAS configurations written in JSON style, with
braces and brackets. It means exactly the same thing to the parser — the
indented style shown here is simply easier to read and edit.
