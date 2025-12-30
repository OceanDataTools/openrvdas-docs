---
permalink: /type_hints/
title: "Using Type Hints When Writing Transforms and Writers"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

OpenRVDAS Transforms, and Writers support Python type hints to validate their inputs. This approach replaces the deprecated method of passing explicit `input_format` and `output_format` lists to the module constructors.

By adding standard Python type annotations to your `transform()` or `write()` methods, you allow the base class to automatically handle common data processing tasks, such as filtering `None` values, unpacking lists, and serializing `DASRecord` objects.

## The Pattern

The standard pattern for writing a Transform or Writer that leverages this functionality involves two steps:
1.  **Annotate**: Add type hints to your `transform` or `write` method signature.
2.  **Check & Digest**: Inside the method, use `can_process_record()` to check validity and `digest_record()` to handle exceptions/conversions.

### Example Transform

```python
from typing import Union
from logger.transforms.transform import Transform

class ExampleTransform(Transform):
    def transform(self, record: Union[str, dict]) -> Union[str, None]:
        """
        Accepts strings or dicts. Returns a string or None.
        """
        # 1. Check if the record is a string or dict
        if not self.can_process_record(record):
            # 2. If not, ask the BaseModule to 'digest' it (handle lists, None, etc.)
            return self.digest_record(record)

        # 3. Process the known type safely
        if isinstance(record, dict):
            return str(record)
        return record.upper()
```

## How It Works

The `Transform` class inherits from `BaseModule`, which inspects the annotations of your method to determine what data types your code expects.

### `can_process_record(record)`

This method checks if the incoming `record` matches the type hints you defined.

* **If type hints exist**: Returns `True` if `isinstance(record, types)` is true.
* **If NO type hints exist**: Returns `False` for `None` or `list` types (expecting `digest_record` to handle them), and `True` for everything else.
* **Empty Strings**: Special case where empty strings return `False` so they can be punted to `digest_record` (which turns them into `None`).

### `digest_record(record)`

If `can_process_record` returns `False`, you should return the result of `digest_record(record)`. This utility method performs several helpful conversions automatically:

1.  **List Unpacking**: If `record` is a list, it iterates through the list, calls your method recursively on each item, and returns a new list of results (filtering out `None` values).
2.  **None Handling**: If `record` is `None` (or an empty string), it simply returns `None`.
3.  **Automatic Conversions**:
    * **Numbers to Strings**: If your type hint includes `str` but the record is an `int` or `float`, it converts the number to a string.
    * **DASRecord to JSON**: If your type hint includes `str` but the record is a `DASRecord` object, it calls `record.as_json()`.

## Deprecation Warning

If you attempt to use the old style `input_format` or `output_format` arguments in your module initialization, the system will log a warning advising the use of type hints instead.
