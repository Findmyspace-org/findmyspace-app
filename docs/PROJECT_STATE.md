## FindMySpace - Current State

### Auth
- Supabase auth working
- Login / logout implemented
- Header shows login/logout correctly

### Listings
- Create listing working
- Redirect to My Listings after create (planned)

### Booking
- BookingRequestForm implemented
- Overlap prevention implemented (frontend + DB)
- Calendar shows approved bookings (pending coming)

### Next focus
- Show pending bookings in calendar
- Owner approval flow

# FindMySpace - Project State

## Stable now

### Browse spaces
- `app/spaces/page.tsx` is currently stable
- Keep current working version
- Do not replace this file unless specifically reviewing from current saved code
- URL sync / query param auto-update is considered unstable and should remain disabled for now

### Price filter
- `app/components/PriceRangeFilter.tsx` uses button-based booking unit selection
- Booking unit options:
  - All
  - By hour
  - By day
  - By month
- Slider remains active
- Step is R50

### Space cards
- `app/components/SpaceCard.tsx` may be enhanced later
- Not part of current browse stabilization

## Change control rules
- Change one file at a time where possible
- If a second file is required, explicitly note dependency
- Prefer stabilizing before enhancing
- Before changing `app/spaces/page.tsx`, review the current saved version first

## Known caution areas
- URL-sync effects can cause render loops
- Filter defaults can hide all listings if max price becomes 0
- Booking unit logic affects:
  - browse filters
  - slider max logic
  - sorting logic
  - result counts

  ### Browse price caps
- Booking unit slider uses fixed marketplace caps, not live database max values
- All = R20000
- By hour = R5000
- By day = R10000
- By month = R20000
- File affected: `app/spaces/page.tsx` only

### Browse layout
- `/spaces` is listings-first layout
- inline map removed from results page
- left column includes:
  - map view button/card
  - price and booking filters
  - category filters
- map view opens separate page:
  - `app/spaces/map/page.tsx`
- current filter state is passed via query string to map page

### Browse page layout updates
- Removed inline "Listings" heading above the results cards
- Browse sort dropdown now uses:
  - Price: high to low
  - Price: low to high
- Default sort is Price: high to low

### Map page behavior
- `/spaces/map` should respect the same current filters as `/spaces`
- In All booking mode, map filtering should not exclude spaces too aggressively
- Map still only shows spaces with latitude and longitude

### Shared filtering system
- Shared helper created at `lib/spaceFilters.ts`
- `/spaces` and `/spaces/map` both use the same filter logic from the helper
- Sorting is also centralised
- Price caps are centralised
- This removes filter drift between results and map pages