#!/usr/bin/env python3
"""Evening post — Sport or Astuce (by weekday, 17:00 UTC = 19:00 Brussels)"""
import sys, os
from datetime import datetime

# Mon/Wed/Fri/Sun = sport, Tue/Thu/Sat = astuce
SPORT_DAYS = {0, 2, 4, 6}  # Mon, Wed, Fri, Sun
pillar = "sport" if datetime.now().weekday() in SPORT_DAYS else "astuce"
print(f"Evening post → {pillar} ({datetime.now().strftime('%A')})")
sys.argv = ['evening_post.py', '--pillar', pillar]
exec(open('/work/viktor-spaces/on-mange-quoi/meta-automation/daily_post.py').read())
