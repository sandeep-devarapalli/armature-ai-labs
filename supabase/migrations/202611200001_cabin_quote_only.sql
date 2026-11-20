-- New first-floor rentals start with a negotiated quote. Preserve existing agreements and resource links.
update private.rental_catalogue
set released = false
where code in ('cabin201', 'cabin202', 'cabin203');
