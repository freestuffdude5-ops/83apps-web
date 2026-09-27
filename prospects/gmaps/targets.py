"""Filters crawled places to independent Ormond Beach businesses and splits them by website type.
    python3 targets.py places.json targets.json
"""
import json, re, sys
from urllib.parse import urlparse

CHAIN = re.compile(r"mcdonald|burger king|wendy|taco bell|subway|starbucks|dunkin|publix|walgreens|cvs|7-eleven|wawa|circle k|dollar|walmart|target|home depot|lowe'?s|autozone|advance auto|o'reilly|napa auto|pizza hut|domino|papa john|chick-fil|kfc|popeyes|panera|ace hardware|great clips|supercuts|sport clips|verizon|at&t|t-mobile|ups store|fedex|goodwill|aldi|winn-dixie|jiffy lube|firestone|midas|meineke|take 5|valvoline|tires plus|discount tire|mavis|goodyear|pep boys|state farm|allstate|farmers insurance|geico|edward jones|h&r block|jackson hewitt|liberty tax|arby|sonic drive|zaxby|culver|dairy queen|checkers|little caesars|jersey mike|firehouse subs|chipotle|applebee|olive garden|outback|longhorn|texas roadhouse|ihop|denny|waffle house|cracker barrel|petsmart|petco|planet fitness|anytime fitness|orangetheory|massage envy|european wax|hand & stone|the joint|aspen dental|heartland dental|smile|advent|halifax health|adventhealth|orlando health|quest diagnostics|labcorp|keller williams|remax|re/max|coldwell|berkshire|century 21|exp realty|realty one|chase|bank|credit union|truist|wells fargo|regions|fifth third|servpro|servicemaster|roto-rooter|mr\. rooter|terminix|orkin|truly nolen|chem-dry|stanley steemer|molly maid|merry maids|two men|u-haul|public storage|extra space|cubesmart|life storage|kumon|mathnasium|sylvan|primrose|kindercare|goddard|tutor time|la petite|learning experience|snap fitness|crunch|gold's gym|ymca|jenny craig|sherwin|benjamin moore|mattress firm|rooms to go|ashley|la-z-boy|badcock|harbor freight|tractor supply|big lots|ross|tj maxx|marshalls|bealls|belk|kohl|best buy|staples|office depot|hobby lobby|michaels|joann|ulta|sally beauty|gamestop|five below|ollie", re.I)
SOCIAL = re.compile(r'facebook\.com|instagram\.com|linktr\.ee|yelp\.com|nextdoor\.com|tiktok\.com|twitter\.com|x\.com/', re.I)
BOOKING = re.compile(r'booksy|vagaro|styleseat|glossgenius|square\.site|squareup|fresha|schedulicity|gocheckin|vidobooking|mindbody|toasttab|clover\.com|doordash|ubereats|grubhub|menufy|pizzamico|chownow|order\.online|business\.site|wixsite|godaddysites|sites\.google|weebly\.com|localsearch\.com|edan\.io|jany\.io|setmore|acuity', re.I)

P = json.load(open(sys.argv[1]))['places']
CITIES = sys.argv[3].split('|') if len(sys.argv) > 3 else ['Ormond Beach']
CITY = re.compile('|'.join(re.escape(c) + ',' for c in CITIES))
rows = []
for p in P.values():
    a = p.get('address') or ''
    if not re.search(CITY, a): continue
    p['city'] = next((c for c in CITIES if c + ',' in a), '')
    if p.get('closed'): continue
    if CHAIN.search(p.get('name') or ''): continue
    w = p.get('website') or ''
    kind = 'none' if not w else 'social' if SOCIAL.search(w) else 'booking/free page' if BOOKING.search(w) else 'own site'
    p['kind'] = kind
    p['domain'] = urlparse(w).hostname.replace('www.', '') if w and kind == 'own site' else None
    rows.append(p)
# a domain shared by many listings is a chain / franchise site
from collections import Counter
dc = Counter(r['domain'] for r in rows if r['domain'])
for r in rows:
    if r['domain'] and dc[r['domain']] >= 4: r['kind'] = 'multi-location'
json.dump(rows, open(sys.argv[2], 'w'), indent=1)
print(len(rows), 'Ormond independents;', Counter(r['kind'] for r in rows))
