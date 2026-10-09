# Motte & Bailey Restaurant website

A mobile-responsive marketing website built with semantic HTML, CSS and vanilla JavaScript. It uses the two restaurant photos supplied with the project.

## Run locally

- Open `index.html` in a browser, or serve this directory with any static web server.
- For example, with Node installed: `npx serve .`

## Included

- Responsive desktop/mobile layout and mobile navigation
- Restaurant story, atmosphere, menu introduction, contact/location details
- Click-to-call and Google Maps directions
- Reservation enquiry form with browser validation and a generated email draft
- SEO description, Open Graph metadata, Restaurant structured data, keyboard-friendly labels and reduced-motion support

## Before publishing — important

1. **Connect reservations:** the form currently opens the visitor's email app with a prefilled message. It does not store bookings or confirm availability. Replace this with the restaurant's actual booking platform or a secure backend/API and set a real recipient email address.
2. **Verify content:** confirm current opening hours, menu items, prices, dietary/allergen information, and whether group bookings are accepted. The menu copy is intentionally general because a verified current menu was not supplied.
3. **Set canonical website URL:** add the production domain to metadata and the Restaurant structured data.
4. **Image permissions:** confirm the restaurant has permission to publish the supplied photographs.
5. **Privacy:** if adding analytics, mailing lists or a backend booking system, add an appropriate privacy notice and cookie handling where required.

## Deployment

This is a static site and can be deployed to Netlify, Vercel, Cloudflare Pages, GitHub Pages, or any web host that serves static files. Upload the contents of this folder; no build step is required.
