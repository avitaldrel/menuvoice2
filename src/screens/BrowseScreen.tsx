// Silent browse mode. Renders the parsed menu as semantic HTML so VoiceOver's
// heading rotor can jump section-to-section (h2) and item-to-item (h3) without
// any audio playing.

import { Screen, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps, Route } from '../nav';

export default function BrowseScreen({
  navigate,
  route,
}: ScreenProps & { route: Extract<Route, { name: 'browse' }> }) {
  const { menu, restaurantName } = route;

  return (
    <Screen>
      {/* h1 = restaurant — top of the heading rotor */}
      <h1 className="title" style={{ marginTop: 4 }}>
        {restaurantName}
      </h1>

      {/* Scrollable menu content; headings remain in the a11y tree regardless */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {menu.categories.map((category) => (
          <section key={category.name}>
            {/* h2 = category — VoiceOver rotor "Headings" level 2 */}
            <h2 className="browse-category">{category.name}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {category.items.map((item) => (
                <article key={item.name} className="browse-item">
                  <div className="browse-item-header">
                    {/* h3 = item — VoiceOver rotor "Headings" level 3 */}
                    <h3 className="browse-item-name">{item.name}</h3>
                    {item.price && (
                      <span className="browse-item-price" aria-label={`Price: ${item.price}`}>
                        {item.price}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="browse-item-desc">{item.description}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}

        {menu.notes && (
          <section>
            <h2 className="browse-category">Notes</h2>
            <p className="body" style={{ marginTop: 8 }}>{menu.notes}</p>
          </section>
        )}
      </div>

      <PrimaryButton
        label="Talk to MenuVoice"
        hint="Switch to voice conversation mode"
        onClick={() => navigate({ name: 'conversation', menu, restaurantName })}
        style={{ minHeight: 70 }}
      />
      <SecondaryButton
        label="Done"
        hint="Return home"
        onClick={() => navigate({ name: 'home' })}
      />
    </Screen>
  );
}
