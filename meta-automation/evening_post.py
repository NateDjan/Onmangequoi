#!/usr/bin/env python3
"""Evening post — Sport or Astuce (by weekday, 17:00 UTC)"""
import sys, os
from datetime import datetime

SPORT_DAYS = {0, 2, 4, 6}  # Mon, Wed, Fri, Sun
pillar = "sport" if datetime.now().weekday() in SPORT_DAYS else "astuce"
print(f"Evening post → {pillar} ({datetime.now().strftime('%A')})")
sys.argv = ['evening_post.py', '--pillar', pillar]

import runpy
runpy.run_path(os.path.join(os.path.dirname(__file__), 'daily_post.py'), run_name='__main__')
