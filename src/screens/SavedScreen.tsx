// Saved restaurants. Load a captured menu without re-capturing.

import { useEffect, useState } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { SavedRestaurant } from '../types';
import { loadSavedRestaurants, deleteRestaurant } from '../lib/storage';

export default function SavedScreen({ navigate, goBack }: ScreenProps) {
  const [list, setList] = useState<SavedRestaurant[] | null>(null);

  const refresh = () => loadSavedRestaurants().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  const remove = async (id: string) => {
    await deleteRestaurant(id);
    refresh();
  };

  return (
    <Screen>
      <Title>Saved restaurants</Title>

      {list === null ? (
        <Body>Loading…</Body>
      ) : list.length === 0 ? (
        <Body>No saved restaurants yet. Capture a menu and it will appear here.</Body>
      ) : (
        <div className="col">
          {list.map((r) => (
            <div key={r.id} className="card" aria-label={`${r.name}, captured ${formatDate(r.capturedAt)}`}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{r.name}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                Last visit: {formatDate(r.capturedAt)}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <PrimaryButton
                  label="Load menu"
                  hint={`Open the saved menu for ${r.name}`}
                  onClick={() => navigate({ name: 'conversation', menu: r.menu, restaurantName: r.name })}
                  style={{ flex: 2 }}
                />
                <SecondaryButton label="Delete" tone="danger" onClick={() => remove(r.id)} style={{ flex: 1 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="spacer" />
      <SecondaryButton label="Back" onClick={goBack} />
    </Screen>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
