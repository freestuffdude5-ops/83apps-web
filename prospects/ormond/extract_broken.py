# Pulls each broken-website prospect's broken URL out of ranked.json -> broken_candidates.json
import json, re
r = json.load(open('ranked.json'))
SKIP = re.compile(r'localsearch|booksy|square\.site|wixsite|hub\.biz|edan\.io|jany\.io|godaddysites|sites\.google|nextdoor|yellowpages|birdeye|facebook|yelp|ormondbeachconnection|pizzamico|dineoption')
DOM = re.compile(r'(?:https?://)?((?:[a-z0-9-]+\.)+(?:com|net|biz|top|to|org|site|co|us|info))(/[^\s,;)]*)?', re.I)
out = []
for x in r:
    st = x.get('websiteStatus') or ''
    if not st.lower().startswith(('dead', 'placeholder')): continue
    url = None
    for m in DOM.finditer(st):
        d = m.group(1).lower()
        if 'business.site' in d or not SKIP.search(d): url = m.group(0); break
    if not url: continue
    if not url.startswith('http'): url = 'http://' + url
    out.append({'name': x['name'], 'url': url.rstrip('.'), 'status': st, 'group': x['_group']})
json.dump(out, open('broken_candidates.json', 'w'), indent=1)
print(len(out))
