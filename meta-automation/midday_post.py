#!/usr/bin/env python3
"""Midday post — Mixed pillar based on day of month (12:00 UTC)"""
import sys, os
from datetime import datetime

PILLAR_CYCLE = ["gourmand", "astuce", "leger", "sport"]
pillar = PILLAR_CYCLE[datetime.now().day % len(PILLAR_CYCLE)]
print(f"Midday post → {pillar} (day {datetime.now().day})")
sys.argv = ['midday_post.py', '--pillar', pillar]

import runpy
runpy.run_path(os.path.join(os.path.dirname(__file__), 'daily_post.py'), run_name='__main__')
