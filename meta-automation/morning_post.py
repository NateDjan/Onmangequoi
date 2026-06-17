#!/usr/bin/env python3
"""Morning post — Gourmand or Léger (alternating, 08:00 UTC)"""
import sys, os
from datetime import datetime

# Alternate: even days = gourmand, odd days = leger  
pillar = "gourmand" if datetime.now().day % 2 == 0 else "leger"
print(f"Morning post → {pillar} (day {datetime.now().day})")
sys.argv = ['morning_post.py', '--pillar', pillar]
exec(open('/work/viktor-spaces/on-mange-quoi/meta-automation/daily_post.py').read())
