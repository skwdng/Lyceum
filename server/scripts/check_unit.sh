#!/bin/sh
systemctl cat siyige | grep -E 'ExecStart|EnvironmentFile|MemoryMax|LimitNOFILE'
