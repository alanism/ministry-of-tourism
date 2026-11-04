import { useId, useState } from 'react';
import './landing-carousel.css';

const slides = [
  // Public-source discovery is an opt-in, configured preview; it does not promise Instagram trends.
  { title: 'One trip board. Your own magazine.', copy: 'Bring your bookings, saved places and photos into one trip board. Plan with Muse AI or by hand, then turn the trip into a magazine to keep.', detail: 'Start with your flights, stay and places to visit. Ask Muse to suggest what fits around those plans, then edit the board to make the trip your own.', image: 'Model in a yellow Thessaloniki-inspired FCC T-shirt beside a plush character and an illustrated book.' },
  { title: 'Build a trip together.', copy: 'Send an editable trip to family or friends. They add places, photos and notes to their copy and send it back, so you can plan with everyone’s ideas.', detail: 'Download an editable ZIP for a holiday plan, reunion or guest guide. Each person works on their own copy; open the returned package in MoT to see their changes.', image: 'Model in a cream FCC-inspired city T-shirt holding a postcard beside a plush character.' },
  { title: 'Use ranked-choice voting.', copy: 'When the group wants different things, each household ranks its favorite places. Compare the ranked-choice voting results and people’s concerns before deciding what goes into the trip.', detail: 'Collect household reply files and read the results as points or instant-runoff. Approved, Maybe and Denied responses stay visible alongside the rankings; you decide what to put in the plan.', image: 'Three friends in FCC-inspired café-art T-shirts choosing travel postcards together around a table.' },
  { title: 'Make art from your photos.', copy: 'Fashion Illustration for people. City Ink for streets. Make magazine art from your photos. Free image generation for the hackathon and prelaunch: coming soon.', detail: 'On your board, choose Create photo illustration. Select a photo and style, review the AI result, then save it privately for your magazine. The free hackathon and prelaunch preview is currently unavailable. You can choose paid generation with your own Meta key.', image: 'Model in a red Zurich-inspired FCC T-shirt holding an illustrated book.' },
  { title: 'Create your own travel magazine.', copy: 'Turn your itinerary, photos and notes into magazine pages with FCC city stories and artwork. Download an HTML magazine to read in a browser, or a PDF to share.', detail: 'FCC (Foreign Clubbers Correspondence) supplies the city stories and artwork. Arrange the artwork in Composition and preview your issue in Keepsakes before exporting.', image: 'Model in a navy Saint-Tropez-inspired FCC T-shirt reading an illustrated book.' },
  { title: 'Find souvenirs. Choose gifts.', copy: 'Choose a city that means something to you or someone you know. Browse FCC city-art T-shirts and save favorites as souvenir or gift ideas.', detail: 'Browse designs and save gift ideas in FCC’s shop. T-shirt checkout and printed photo-book gifts are planned; saving an idea does not place an order.', image: 'Model in a white Bangkok brush-portrait T-shirt beside a framed FCC colored map of Bangkok.' },
  { title: 'Share your trip. Keep notes private.', copy: 'Share the plan with friends without sending your private notes and photos. Choose a review copy only when you want a trusted person to see them.', detail: 'In Export, Public copy leaves out private cards and images. Review copy includes them, so check its contents before sending.', image: 'Model in a white Denpasar-inspired portrait T-shirt.' },
  { title: 'Build your magazine as you travel.', copy: 'Add each day’s photos, places and notes while the details are fresh. Preview the magazine on your iPad, then export the latest issue to read or share.', detail: 'Keep adding to the board throughout the trip. Open Keepsakes to preview the updated pages, then export a new HTML magazine or PDF to share the current version.', image: 'Taipei model in a white brush-portrait T-shirt reading a Taipei trip magazine on an iPad.' },
  { title: 'Discover more like this.', copy: 'Start with FCC. Preview related places from public sources when discovery is enabled. Review the sources. You decide.', detail: 'In Explore FCC, choose places you like to look for related venues and inspect the source excerpts before adding favorites to your board. Public discovery requires an enabled server and has usage limits. Coverage varies; suggestions are not verified trends. FCC browsing remains available.', image: 'FCC-inspired T-shirt model reviewing ideas on an iPad; illustrative discovery campaign scene.' },
];

export function LandingCarousel() {
  const [index, setIndex] = useState(0);
  const id = useId();
  const slide = slides[index]!;
  const asset = `/assets/landing-carousel/slide-${String(index + 1).padStart(2, '0')}`;
  const move = (direction: number) => setIndex(current => (current + direction + slides.length) % slides.length);

  return <section className="mot-carousel" aria-roledescription="carousel" aria-label="Plan, share and keep your trip">
    <header className="mot-carousel-heading"><h2>A trip worth keeping.</h2><span className="m-eyebrow">Plan · share · remember</span></header>
    <div id={id} aria-live="polite" aria-atomic="true">
      <figure className="mot-carousel-slide" role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`}>
        <div className="mot-carousel-visual" key={asset}>
          <img src={`${asset}-background.jpg`} alt={slide.image} width={1600} height={900} loading="lazy" decoding="async" />
          <img className="mot-carousel-overlay" src={`${asset}-overlay.svg`} alt="" aria-hidden="true" width={1600} height={900} loading="lazy" decoding="async" />
        </div>
        <figcaption>
          <div className="mot-carousel-copy"><h3>{slide.title}</h3><p>{slide.copy}</p></div>
          <p className="mot-carousel-detail">{slide.detail}</p>
        </figcaption>
      </figure>
    </div>
    <div className="mot-carousel-controls">
      <button type="button" className="m-btn" aria-label="Previous slide" aria-controls={id} onClick={() => move(-1)}><span aria-hidden="true">←</span></button>
      <div className="mot-carousel-indicators" role="group" aria-label="Choose a slide">
        {slides.map((item, number) => <button key={item.title} type="button" aria-label={`Show slide ${number + 1}: ${item.title}`} aria-controls={id} aria-current={number === index ? 'true' : undefined} onClick={() => setIndex(number)}><span aria-hidden="true" /></button>)}
      </div>
      <button type="button" className="m-btn" aria-label="Next slide" aria-controls={id} onClick={() => move(1)}><span aria-hidden="true">→</span></button>
    </div>
    <p className="mot-carousel-disclosure m-muted">Illustrative, AI-generated scenes based on FCC references; shirt details may differ from the originals. Magazine exports are digital. T-shirt checkout is not open yet; photo-book printing is a future idea.</p>
  </section>;
}
