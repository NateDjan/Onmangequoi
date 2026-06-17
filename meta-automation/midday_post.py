#!/usr/bin/env python3
"""Midday post — Mixed pillar based on day of month (12:00 UTC = 14h Brussels)"""
import sys, os
from datetime import datetime

# Cycle through all 4 pillars across month days
PILLAR_CYCLE = ["gourmand", "astuce", "leger", "sport"]
pillar = PILLAR_CYCLE[datetime.now().day % len(PILLAR_CYCLE)]
print(f"Midday post → {pillar} (day {datetime.now().day})")
sys.argv = ['midday_post.py', '--pillar', pillar]
exec(open('/work/viktor-spaces/on-mange-quoi/meta-automation/daily_post.py').read())
