"""Design family + copy for each kind of business. Headlines make no factual claims about the business
(no years, licenses, prices, guarantees); facts on the page come only from Google/their site.
`*word*` in a headline = the accent/italic word. {city} is filled in."""
import re

G = []


def g(key, match, arch, eyebrow, h1, cta, cta_short, links, reviews_h2='What *customers* say', services_h2='What we *do*', form=None, sub=None):
    G.append(dict(key=key, re=re.compile(match, re.I), arch=arch, eyebrow=eyebrow, h1=h1, cta=cta, cta_short=cta_short, links=links,
                  reviews_h2=reviews_h2, services_h2=services_h2, form=form, sub=sub))


Q = ['Services', 'Reviews', 'About', 'Contact']
# ---- trades / auto (bold)
g('roof', r'roof', 'bold', 'Roofing', ['Roofs built for *Florida* weather.', 'Your roof, *done right*.', 'Straight answers. *Solid* roofs.'], 'Get a free estimate', 'Free estimate', Q)
g('auto', r'auto repair|car repair|mechanic|transmission|brake|\btires?\b|oil change|auto body|collision|smog|muffler|auto electrical|diesel', 'bold', 'Auto repair', ['Auto repair you can *trust*.', 'Keep your car *running right*.', 'Real mechanics. *Real* answers.'], 'Book a service', 'Book service', ['Services', 'Reviews', 'About', 'Visit'])
g('autoshop', r'truck accessor|auto parts|accessories store|tire shop|wheel|off.?road|lift kit|performance|car stereo|window tint|vinyl wrap', 'bold', 'Auto accessories', ['Built for the *way you drive*.', 'Gear up. *Stand out*.'], 'Visit the shop', 'Visit', ['Products', 'Services', 'Reviews', 'Visit'])
g('detail', r'detailing|car wash', 'bold', 'Detailing', ['That *showroom* shine.', 'Make it look *new* again.'], 'Book a detail', 'Book now', Q)
g('plumb', r'plumb|drain|septic|water heater|well drilling|water treatment|pump', 'bold', 'Plumbing', ['Plumbing problems, *fixed right*.', 'Leaks, clogs and repairs, *handled*.'], 'Request service', 'Get help', Q)
g('hvac', r'hvac|air condition|heating|a/c|ac repair|refrigeration|duct', 'bold', 'Heating & air', ['Stay *cool* all summer long.', 'Comfort you can *count on*.'], 'Schedule service', 'Schedule', Q)
g('elec', r'electric|generator|solar|lighting contractor', 'bold', 'Electrical', ['Wired *right* the first time.', 'Power you can *count on*.'], 'Request a quote', 'Get a quote', Q)
g('build', r'general contractor|construction|contractor|remodel|builder|concrete|paving|masonry|framing|drywall|flooring|tile|countertop|granite|cabinet|carpent|kitchen|bathroom|siding|insulation|fence|deck|screen|enclosure|garage door|door|window installation|welding|metal|steel|fabricat|demolition|excavat|pole barn|gutter|waterproof|restoration|foundation|stucco|epoxy|coating', 'bold', 'Built right', ['Built right. Built to *last*.', 'Quality work, *start to finish*.', 'Your project, *done right*.'], 'Get a free estimate', 'Free estimate', ['Services', 'Projects', 'Reviews', 'Contact'], services_h2='What we *build*')
g('sign', r'sign shop|\bsigns?\b|print|graphic|embroider|screen print|vinyl|wrap', 'bold', 'Signs & print', ['Get *noticed*.', 'Signs that *stand out*.'], 'Request a quote', 'Get a quote', ['Services', 'Work', 'Reviews', 'Contact'])
g('boat', r'boat|marine|yacht|outboard', 'bold', 'Marine service', ['Get back on the *water*.', 'Boats running *right*.'], 'Schedule service', 'Schedule', Q)
g('moto', r'motorcycle|atv|golf cart|scooter|bike shop|bicycle', 'bold', 'Ride ready', ['Built to *ride*.', 'Keep it *rolling*.'], 'Book service', 'Book', Q)
g('tow', r'\btow|roadside|locksmith', 'bold', 'Fast help', ['Help is a *call* away.', 'Stuck? We\'ve *got you*.'], 'Call now', 'Call', Q)
g('dj', r'\bdj\b|band|entertainer|karaoke', 'bold', 'Entertainment', ['Keep the dance floor *full*.'], 'Check availability', 'Book', ['Services', 'Events', 'Reviews', 'Contact'])
g('tattoo', r'tattoo|piercing', 'bold', 'Tattoo studio', ['Art that *lasts*.', 'Your idea, *inked right*.'], 'Book a consult', 'Book', ['Artists', 'Work', 'Reviews', 'Visit'])
g('gym', r'gym|fitness|personal trainer|crossfit|boxing|martial|karate|jiu|mma|kickbox|dojo|bootcamp', 'bold', 'Training', ['Stronger *every* week.', 'Show up. *Level up*.'], 'Start training', 'Get started', ['Programs', 'Coaches', 'Reviews', 'Visit'], services_h2='Ways to *train*')
# ---- outdoor / home services (fresh)
g('lawn', r'lawn|landscap|sod|irrigation|sprinkler|garden|nursery|mulch|hardscap', 'fresh', 'Lawn & landscape', ['A yard you\'ll *love* coming home to.', 'Greener lawns, *less hassle*.'], 'Get a free quote', 'Get a quote', Q, form=('Get a free quote', 'Tell us about your yard.'))
g('tree', r'tree|stump|arborist', 'fresh', 'Tree service', ['Tree work, *done safely*.', 'Big trees. *Clean* work.'], 'Get a free quote', 'Get a quote', Q, form=('Get a free quote', 'Tell us what you need cut.'))
g('pool', r'pool|spa repair|hot tub', 'fresh', 'Pool service', ['A cleaner pool, *without the work*.', 'Clear water, *all year*.'], 'Get a free quote', 'Get a quote', Q, form=('Get a free quote', 'Tell us about your pool.'))
g('clean', r'clean|maid|janitorial|carpet|pressure wash|power wash|window clean|junk|haul|moving|mover|dumpster|waste', 'fresh', 'Cleaning', ['Come home to *clean*.', 'Make it look *new* again.', 'We do the dirty work. *You relax*.'], 'Get a free quote', 'Get a quote', Q, form=('Get a free quote', 'It takes 30 seconds.'))
g('pest', r'pest|termite|exterminat|mosquito|wildlife', 'fresh', 'Pest control', ['Keep the pests *out*.', 'A pest-free home, *finally*.'], 'Get a free quote', 'Get a quote', Q, form=('Get a free quote', 'Tell us what you\'re seeing.'))
g('paint', r'paint', 'fresh', 'Painting', ['A fresh coat, *done right*.', 'Color that makes it *home*.'], 'Get a free estimate', 'Free estimate', Q, form=('Get a free estimate', 'Tell us about the project.'))
g('handy', r'handyman|appliance|repair service|garage|home inspector|inspection|home improvement|installation', 'fresh', 'Home services', ['Fix it list? *Handled*.', 'Repairs done *right*.'], 'Request service', 'Get help', Q, form=('Request service', 'Tell us what needs fixing.'))
# ---- food & drink (editorial)
F = ['Menu', 'Reviews', 'About', 'Visit']
g('breakfast', r'diner|breakfast|brunch|pancake|waffle', 'edit', 'Breakfast & brunch', ['Breakfast, *done right*.', 'Come hungry. *Leave happy*.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('pizza', r'pizza', 'edit', 'Pizza', ['Pizza worth the *drive*.', 'Hot pizza. *Happy* people.'], 'Order online', 'Order', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('mex', r'mexican|taco|tex-mex|latin', 'edit', 'Mexican kitchen', ['Real flavor in *{city}*.', 'Tacos, *tequila* and good times.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('sea', r'seafood|fish|oyster|crab|sushi|poke', 'edit', 'Seafood', ['Fresh from the *coast*.', 'Seafood the *Florida* way.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('bbq', r'barbecue|bbq|smokehouse', 'edit', 'Barbecue', ['Low and slow, *the right way*.', 'Smoke, fire and *good food*.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('nutri', r'nutrition|health food|smoothie|juice|acai|protein|supplement|vitamin', 'edit', 'Healthy fuel', ['Fuel your *day*.', 'Feel good, *taste good*.'], 'See the menu', 'Menu', ['Menu', 'Reviews', 'About', 'Visit'], reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('bake', r'bakery|cake|cupcake|dessert|donut|cookie|ice cream|gelato|frozen yogurt|chocolate|candy|sweet', 'edit', 'Sweets', ['Made fresh. *Made happy*.', 'A little *sweetness* every day.'], 'Order now', 'Order', ['Menu', 'Custom orders', 'Reviews', 'Visit'], reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('cafe', r'coffee|cafe|café|\btea\b|juice|smoothie|kava|kombucha', 'edit', 'Coffee & more', ['Your new favorite *stop*.', 'Good coffee, *good company*.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('bar', r'\bbar\b|pub|brewery|tavern|lounge|wine|cocktail|taproom|grill', 'edit', 'Food & drinks', ['Cold drinks. *Good times*.', 'Your new *local*.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
g('cater', r'cater|food truck|personal chef|meal prep', 'edit', 'Catering', ['Food that makes the *party*.', 'Feed the crowd, *the right way*.'], 'Get a catering quote', 'Get a quote', ['Menus', 'Events', 'Reviews', 'Contact'], reviews_h2='What *clients* say', services_h2='What we *serve*')
g('food', r'restaurant|food|kitchen|eatery|deli|sandwich|burger|chicken|wings|bistro|steak|italian|chinese|thai|indian|japanese|cuban|caribbean|greek|mediterranean|vietnamese|korean|soul|southern|cajun|hawaiian|peruvian|colombian|venezuelan|puerto|haitian|jamaican|halal|vegan|buffet|noodle|ramen|pho|hot dog', 'edit', 'Restaurant', ['Good food. *Good people*.', 'Come hungry. *Leave happy*.', 'A table is *waiting*.'], 'See the menu', 'Menu', F, reviews_h2='Why guests *come back*', services_h2='On the *menu*')
# ---- beauty / pets / wellness / events (soft)
B = ['Services', 'Gallery', 'Reviews', 'Visit']
g('chiro0', r'chiropract|physical therap|sports medicine|rehab', 'clean', 'Chiropractic care', ['Move better. *Feel* better.', 'Get back to *feeling like you*.'], 'Book a visit', 'Book', ['Services', 'About', 'Reviews', 'Contact'], reviews_h2='What *patients* say')
g('pet', r'groom|\bpets?\b|\bdog|\bcats?\b|kennel|boarding|animal', 'soft', 'Pet care', ['Happy pets. *Happy* people.', 'Care your pet will *love*.'], 'Book an appointment', 'Book', B, services_h2='How we *care*')
g('vet', r'veterinar|animal hospital', 'clean', 'Veterinary care', ['Caring for the pets *you love*.'], 'Book a visit', 'Book', Q)
g('nail', r'nail|lash|brow|wax|makeup|beauty|esthetic|facial|skin|tanning|med spa|botox', 'soft', 'Beauty', ['Feel *beautiful* every day.', 'A little *glow* goes a long way.'], 'Book an appointment', 'Book', B)
g('hair', r'hair|salon|barber|stylist|blowout|braid|extension', 'soft', 'Salon', ['Hair you\'ll *love* to wear.', 'Look good. *Feel* better.'], 'Book an appointment', 'Book', B)
g('spa', r'\bspa\b|massage|wellness|reiki|acupunct|float|sauna|holistic|naturopath', 'soft', 'Wellness', ['Slow down. *Breathe*.', 'Time for *you*.'], 'Book a session', 'Book', B)
g('yoga', r'yoga|pilates|barre|meditation|dance', 'soft', 'Studio', ['Find your *balance*.', 'Move, breathe, *feel better*.'], 'See the schedule', 'Classes', ['Classes', 'Teachers', 'Reviews', 'Visit'])
g('photo', r'photograph|video|film|studio|drone|aerial', 'soft', 'Photography', ['Moments worth *keeping*.', 'Your story, *beautifully* told.'], 'Check availability', 'Book', ['Portfolio', 'Packages', 'Reviews', 'Contact'], reviews_h2='What *clients* say', services_h2='What I *shoot*')
g('rental', r'party (equipment )?rental|bounce|tent rental|equipment rental|rental service', 'soft', 'Party rentals', ['Make the party *unforgettable*.', 'Everything for a *great* party.'], 'Check availability', 'Book', ['Rentals', 'Gallery', 'Reviews', 'Contact'], reviews_h2='What *customers* say', services_h2='What we *rent*')
g('event', r'event|wedding|party planner|venue|banquet|decor|balloon|bridal', 'soft', 'Events', ['Celebrations, *beautifully* done.', 'Your day, *perfectly* planned.'], 'Check your date', 'Check date', ['Services', 'Gallery', 'Reviews', 'Contact'], reviews_h2='What *clients* say')
g('flower', r'florist|flower', 'soft', 'Florist', ['Flowers for every *moment*.'], 'Order flowers', 'Order', ['Shop', 'Weddings', 'Reviews', 'Visit'])
g('shop', r'boutique|clothing|jewel|gift|furniture|home goods|decor|antique|thrift|consign|bridal|shoe|store|shop|outlet|mattress|bed', 'soft', 'Shop local', ['Find something *you\'ll love*.', 'Made for *your* home.'], 'Visit the shop', 'Visit', ['Shop', 'About', 'Reviews', 'Visit'], services_h2='What you\'ll *find*')
g('tutor', r'tutor|test prep|music lesson|music school|driving school|language school|coding|computer training', 'clean', 'Lessons', ['Learn it *the right way*.', 'Lessons that *click*.'], 'Book a lesson', 'Book', ['Lessons', 'About', 'Reviews', 'Contact'], reviews_h2='What *students* say', services_h2='What I *teach*')
g('sport', r'tennis|golf|pickleball|swim school|swimming|sports club|athletic|soccer|baseball|basketball|volleyball|climbing|skate|surf', 'fresh', 'Play', ['Get out and *play*.', 'Your game, *leveled up*.'], 'Book a lesson', 'Book', ['Programs', 'Coaches', 'Reviews', 'Contact'], form=('Book a lesson', 'Tell us your level and schedule.'), reviews_h2='What *players* say', services_h2='Ways to *play*')
g('interior', r'interior design|home staging|organizer', 'soft', 'Interiors', ['Rooms you\'ll *love* living in.'], 'Book a consultation', 'Book', ['Services', 'Portfolio', 'Reviews', 'Contact'], reviews_h2='What *clients* say')
g('kids', r'day care|daycare|child care|preschool|tutor|learning|montessori|camp|school', 'soft', 'Learning & care', ['A happy place to *grow*.'], 'Schedule a tour', 'Tour', ['Programs', 'About', 'Reviews', 'Contact'], reviews_h2='What *parents* say', services_h2='Our *programs*')
# ---- professional / medical (clean)
P = ['Services', 'About', 'Reviews', 'Contact']
g('dent', r'dentist|dental|orthodont|endodont|periodont|oral', 'clean', 'Dental care', ['Smiles start *here*.', 'Gentle care, *bright* smiles.'], 'Book a visit', 'Book', P, reviews_h2='What *patients* say')
g('chiro', r'chiropract|physical therap|massage therap|sports medicine|rehab|occupational', 'clean', 'Care that moves you', ['Move better. *Feel* better.'], 'Book a visit', 'Book', P, reviews_h2='What *patients* say')
g('mind', r'psycholog|counsel|therap|mental health|psychiat|social worker|life coach|marriage', 'soft', 'Counseling', ['A calm place to *talk*.', 'Support for *what\'s next*.'], 'Book a consultation', 'Reach out', ['Services', 'About', 'Approach', 'Contact'], reviews_h2='Kind *words*', services_h2='How I can *help*')
g('med', r'doctor|physician|clinic|medical|health|urgent care|dermatolog|optometr|eye|hearing|podiatr|pediatr|family practice|nurse|home health|hospice|pharmacy|lab', 'clean', 'Health care', ['Care that *listens*.', 'Your health, *our focus*.'], 'Book an appointment', 'Book', P, reviews_h2='What *patients* say')
g('realtor', r'real estate|realtor|realty|property|homes|broker', 'clean', 'Real estate', ['Find your place in *{city}*.', 'Your next home *starts here*.', 'Buying or selling? *Let\'s talk*.'], 'Let\'s talk', 'Contact', ['Buy', 'Sell', 'About', 'Contact'], reviews_h2='What *clients* say', services_h2='How I *help*')
g('mortgage', r'mortgage|loan|lender|credit|title company|escrow', 'clean', 'Home loans', ['Home loans, *made simple*.', 'Closing made *simple*.'], 'Get started', 'Start', P, reviews_h2='What *clients* say')
g('ins', r'insurance', 'clean', 'Insurance', ['Coverage that *fits* your life.', 'Protect what *matters*.'], 'Get a quote', 'Quote', P, reviews_h2='What *clients* say')
g('tax', r'\btax|account|cpa|bookkeep|payroll|financial|wealth|invest|advisor|planner', 'clean', 'Tax & finance', ['Numbers handled. *Stress* lowered.', 'Plan for *what\'s next*.'], 'Book a consultation', 'Book', P, reviews_h2='What *clients* say')
g('law', r'law|attorney|lawyer|legal|paralegal|bail|immigration', 'clean', 'Legal help', ['Clear answers when it *matters*.', 'In your *corner*.'], 'Request a consultation', 'Contact', P, reviews_h2='What *clients* say')
g('notary', r'notary|apostille|document', 'clean', 'Notary', ['Documents signed, *done right*.'], 'Book a notary', 'Book', P, reviews_h2='What *clients* say')
g('tech', r'computer|it services|software|web|tech|phone repair|cell phone|electronics|network|security system|camera|alarm|audio|video install|tv', 'clean', 'Tech services', ['Tech problems, *solved*.', 'Technology that *just works*.'], 'Get help', 'Get help', P, reviews_h2='What *clients* say')
g('biz', r'.', 'clean', 'Local business', ['Proudly serving *{city}*.', 'Here to *help*.'], 'Contact us', 'Contact', P)


def pick(categories):
    hay = ' | '.join(categories or [])
    for x in G:
        if x['re'].search(hay): return x
    return G[-1]


ARCH = {
    'bold': dict(vars=dict(bg='#f5f3ef', ink='#15171c', muted='#5d616a', card='#ffffff', **{'card-ink': '#15171c', 'card-muted': '#6b6f78'}, line='rgba(0,0,0,.18)',
                           **{'btn-o-bg': 'transparent', 'fact-bg': '#ffffff', 'fact-line': 'rgba(0,0,0,.08)', 'rev-bg': '#121418', 'rev-ink': '#ffffff', 'rcard': '#1d2026', 'rcard-ink': '#e9eaee',
                              'fh': 'BarlowC, sans-serif', 'fb': 'Barlow, sans-serif', 'fq': 'Barlow, sans-serif', 'q-size': '17px', 'h-w': '800', 'h-ls': '.004em', 'h-lh': '.9', 'h-tt': 'uppercase',
                              'h-size': '104px', 'h-size-m': '54px', 'em-style': 'normal', 'em-w': '800', 'r-btn': '6px', 'wm-w': '800', 'wm-ls': '.02em', 'wm-tt': 'uppercase', 'dark': '#121418'}),
                 accents=['#f26a1b', '#f2b705', '#e03b2f', '#2f80ed', '#19a974'], light_on_dark=True),
    'edit': dict(vars=dict(bg='#1b1512', ink='#f7efe4', muted='rgba(247,239,228,.72)', card='#fffaf2', **{'card-ink': '#1b1512', 'card-muted': '#7a6b5f'},
                           **{'btn-o-bg': 'transparent', 'fact-bg': 'rgba(255,255,255,.05)', 'fact-line': 'rgba(255,255,255,.16)', 'rev-bg': '#f6efe4', 'rev-ink': '#1b1512', 'rcard': '#ffffff', 'rcard-ink': '#2a211b',
                              'fh': 'Newsreader, serif', 'fb': 'Figtree, sans-serif', 'fq': 'Newsreader, serif', 'q-size': '20px', 'h-w': '500', 'h-ls': '-.025em', 'h-lh': '1.0', 'h-tt': 'none',
                              'h-size': '88px', 'h-size-m': '48px', 'em-style': 'italic', 'em-w': '400', 'r-btn': '99px', 'wm-w': '600', 'wm-ls': '-.01em', 'wm-tt': 'none', 'dark': '#120d0b'}),
                 accents=['#e3a456', '#de6b42', '#d4b04c', '#c97b5a', '#8fbf8a'], light_on_dark=True),
    'soft': dict(vars=dict(bg='#fbf6f1', ink='#2a1f2b', muted='#6b5f6c', card='#ffffff', **{'card-ink': '#2a1f2b', 'card-muted': '#857a86'}, line='rgba(42,31,43,.2)',
                           **{'btn-o-bg': '#ffffff', 'fact-bg': '#ffffff', 'fact-line': 'rgba(42,31,43,.08)', 'rev-bg': '#2a1f2b', 'rev-ink': '#fbf6f1', 'rcard': '#ffffff', 'rcard-ink': '#2a1f2b',
                              'fh': 'Cormorant, serif', 'fb': 'Jost, sans-serif', 'fq': 'Cormorant, serif', 'q-size': '22px', 'h-w': '600', 'h-ls': '-.015em', 'h-lh': '.98', 'h-tt': 'none',
                              'h-size': '96px', 'h-size-m': '52px', 'em-style': 'italic', 'em-w': '500', 'r-btn': '99px', 'wm-w': '700', 'wm-ls': '0', 'wm-tt': 'none', 'dark': '#2a1f2b'}),
                 accents=['#c2537f', '#8a63b8', '#2f8f83', '#c0784a', '#5d7d5b', '#b0476a']),
    'clean': dict(vars=dict(bg='#ffffff', ink='#0e1a2b', muted='#55606f', card='#ffffff', **{'card-ink': '#0e1a2b', 'card-muted': '#6b7584'}, line='rgba(14,26,43,.18)',
                            **{'btn-o-bg': '#ffffff', 'fact-bg': '#f6f8fb', 'fact-line': 'rgba(14,26,43,.08)', 'rev-bg': '#0e1a2b', 'rev-ink': '#ffffff', 'rcard': '#16263d', 'rcard-ink': '#e6ebf2',
                               'fh': 'Jakarta, sans-serif', 'fb': 'Jakarta, sans-serif', 'fq': 'Jakarta, sans-serif', 'q-size': '16px', 'h-w': '800', 'h-ls': '-.035em', 'h-lh': '1.03', 'h-tt': 'none',
                               'h-size': '72px', 'h-size-m': '42px', 'em-style': 'normal', 'em-w': '800', 'r-btn': '12px', 'wm-w': '800', 'wm-ls': '-.02em', 'wm-tt': 'none', 'dark': '#0e1a2b'}),
                  accents=['#1f5eff', '#0f7b6c', '#6d3df2', '#c8102e', '#0a6fb8', '#b7791f']),
    'fresh': dict(vars=dict(bg='#eef6f0', bg2='#ffffff', ink='#10251a', muted='#4b6155', card='#ffffff', **{'card-ink': '#10251a', 'card-muted': '#6a7d72'}, line='rgba(16,37,26,.2)',
                            **{'btn-o-bg': '#ffffff', 'fact-bg': '#ffffff', 'fact-line': 'rgba(16,37,26,.08)', 'rev-bg': '#10251a', 'rev-ink': '#ffffff', 'rcard': '#183526', 'rcard-ink': '#e5efe8',
                               'fh': 'Bricolage, sans-serif', 'fb': 'Figtree, sans-serif', 'fq': 'Figtree, sans-serif', 'q-size': '16px', 'h-w': '800', 'h-ls': '-.04em', 'h-lh': '.98', 'h-tt': 'none',
                               'h-size': '78px', 'h-size-m': '45px', 'em-style': 'normal', 'em-w': '800', 'r-btn': '14px', 'wm-w': '800', 'wm-ls': '-.02em', 'wm-tt': 'none', 'dark': '#10251a'}),
                  accents=['#1f9d55', '#0b88d1', '#13a0a0', '#e0761c', '#3d7be0']),
}
