#!/usr/bin/env python3
"""Morning post — Gourmand or Léger (alternating, 08:00 UTC)"""
import sys, os
from datetime import datetime

# Alternate: even days = gourmand, odd days = leger  
pillar = "gourmand" if datetime.now().day % 2 == 0 else "leger"
print(f"Morning post → {pillar} (day {datetime.now().day})")
sys.argv = ['morning_post.py', '--pillar', pillar]

# Use relative path
import runpy
runpy.run_path(os.path.join(os.path.dirname(__file__), 'daily_post.py'), run_name='__main__')
