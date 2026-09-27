"""Manual review of the auto-ranked list (every site below was looked at by eye,
phone and desktop screenshots, on 2026-09-27). score.py imports this."""

T1 = '1 · Website down or hijacked'
T2 = '2 · Not built for phones / clearly dated'
T3 = '3 · Free builder web address'

VERIFIED = {
    # name: (tier, what we saw, angle)
    'Main Street Barber Shop': (T1, 'Their domain now shows gambling spam: the old address lapsed or was taken over. Anyone who clicks it from Google Maps lands on spam.',
        'Urgent and easy to show: "your web address is showing gambling ads". Offer a new site + a fresh domain, booking link.'),
    'HD Drain Cleaning': (T1, 'Their listed website redirects to an unrelated, broken site (israelgalvan.com).',
        'Plumber with no working site: every Google click is a lost emergency call. One-page site with tap-to-call.'),
    'Mid Florida Pool & Spa': (T1, 'Domain no longer exists (checked twice).', 'Replacement site, fast; recurring-service quote form.'),
    'Next Level Pool Cleaning and Supplies': (T1, 'Homepage returns a server error (HTTP 500, checked twice).', 'Replacement site; weekly-service signup form.'),
    'EverGreen Landscapes': (T1, 'Homepage returns "page not found" (404, checked twice).', 'Replacement site with a free-estimate form.'),
    'ReFine Pressure Washing and Exteriors': (T1, 'Homepage returns "page not found" (404, checked twice).', 'Replacement site; before/after gallery + quote form.'),
    'Port Orange Car Doctor': (T1, 'Their site is labeled "Unofficial Website" on someone else\'s domain (haamacon.com).',
        'They don\'t own their web presence. Offer an official site on their own domain.'),
    'PawZazz Pet Salon': (T1, 'Site is still a "Launching Soon" placeholder, © 2021.', 'Finish what they started: simple site + online grooming booking.'),
    'Lee Nails': (T1, 'Their Google "business.site" page is dead (Google shut those down).', 'Small, cheap site + booking link; many salons lost these sites the same way.'),
    'Fleur De Lis Salon': (T2, 'Desktop-only layout: on a phone the text is tiny and the page scrolls sideways.', 'Phone-vs-mockup side by side; add online booking.'),
    'Nord Pest Control': (T2, 'No mobile layout; dated design.', 'Mobile rebuild with tap-to-call and a quote form.'),
    'Port Orange Pest Control': (T2, 'No mobile layout; dated design.', 'Mobile rebuild with tap-to-call and a quote form.'),
    'Terry Blanks Jr DDS Family Dental Care': (T2, 'Dated, not mobile-friendly.', 'New-patient booking, insurance info up front, reminders later.'),
    'Port Orange Pools': (T2, 'Old, not mobile-friendly (same operator as NSB Pools: one pitch covers both).', 'One modern site for both brands.'),
    'NSB Pools': (T2, 'Old, not mobile-friendly (same operator as Port Orange Pools).', 'Pitch together with Port Orange Pools.'),
    'Daytona Softwash': (T2, 'Dated, hard to use on a phone.', 'Before/after gallery + instant quote form.'),
    'Ormond Lawn Care': (T2, 'Dated, hard to use on a phone.', 'Mobile rebuild + quote form.'),
    'Natural Health and Wellness Chiropractic, LLC': (T2, 'Dated, not mobile-friendly.', 'Online booking + reminders.'),
    'Dickinson & McDonald, PA': (T2, 'Dated design, small text on phones.', 'Clean professional refresh; client upload/intake form.'),
    'Wholesale Furnature Outlet': (T2, 'Dated, hard to use on a phone.', 'Mobile rebuild with inventory photos and tap-to-call.'),
    'Consigned Interiors': (T2, 'Dated, hard to use on a phone.', 'Mobile rebuild; "new arrivals" section they can update.'),
    'On-Demand Handyman': (T2, 'Works, but dated and weak on phones (moderate).', 'Quote form + tap-to-call up top.'),
    'Pressure Clean USA': (T2, 'Works, but dated (moderate).', 'Refresh + quote form.'),
    'Bulldog Lawn & Landscaping': (T2, 'Works, but dated (moderate).', 'Refresh + quote form.'),
    'All Pools Matter LLC': (T2, 'Works, but dated (moderate).', 'Refresh + service signup form.'),
    'Lightyear Electric LLC': (T3, 'Site is on a free Wix address (lightyearelectricl.wixsite.com/my-site).', 'Own domain + proper site; low price, fast win.'),
    'R.J.P Handyman LLC': (T3, 'Site is on a free Wix address (rjpcmp.wixsite.com).', 'Own domain + proper site; low price, fast win.'),
    'G & M Automotive Center Inc': (T3, 'Site is on a free builder address (g-inc-port-orange.edan.io).', 'Own domain + proper site.'),
    'All of the Above Handyman Solutions LLC': (T3, 'Decent-looking page, but on a Jobber subdomain (aotahs.jobbersites.com).', 'Own domain + SEO; lighter pitch.'),
}
# lower fit: site down, but not a core target business
LOW_FIT_DOWN = {'Nest Luxury Living', "Bob's Bike Shop"}

# looked fine (or already being fixed) on manual review: not a prospect
FINE = {
    'Venetian Nail Spa': 'Moved to a new site',
    'Sun Coast Fence': 'Fine on a phone',
    'Imperial Pest Prevention': 'Modern regional company',
    "Cherise's Salon": 'Rebuild already in progress',
    "Cole's Landscaping and Property Maintenance": 'Looks fine',
    'Law Office of Jeffrey A. Klein': 'Looks fine',
    'Grow with the Flow Lawn Service': 'Looks fine',
    'JSA Lawncare': 'Looks fine',
    'Vision One': 'Looks fine',
    'Beautiful Hair Color Studio': 'Unclear; low priority',
}
