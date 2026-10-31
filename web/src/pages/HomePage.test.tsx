import { render, screen, waitFor } from '@testing-library/react';
import { afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { ClientProvider } from '../game/ClientContext';
import { appError, FakeGameClient } from '../game/fakeGameClient';
import { GameSettingsPage } from './GameSettingsPage';
import { clearHostDraft } from './hostDraft';
import { HomePage } from './HomePage';

function Landing() {
  return <div>at {useParams().code}</div>;
}

afterEach(() => clearHostDraft());

function setup(client = new FakeGameClient()) {
  render(
    <ClientProvider value={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/host" element={<GameSettingsPage />} />
          <Route path="/g/:code" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    </ClientProvider>,
  );
  return client;
}

describe('HomePage', () => {
  it('Host a game opens Game settings (no game yet); Create game creates it and navigates to its code', async () => {
    const client = setup();
    await userEvent.type(screen.getByLabelText('Your name'), 'Stephen');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(await screen.findByRole('heading', { name: 'Game settings' })).toBeInTheDocument();
    expect(client.calls).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(screen.getByText('at ABCDE')).toBeInTheDocument());
    expect(client.calls[0]).toEqual(['createGame', 'Stephen', { freeSpace: false }]);
  });

  it('shows the section labels and the Play OYBC mark', () => {
    setup();
    expect(screen.getByText('Host a game', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Join', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Play OYBC' })).toBeInTheDocument();
  });

  it('joins by code, uppercased', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Game code'), 'abcde');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByText('at ABCDE')).toBeInTheDocument();
  });

  it('checks the name before leaving Home: a name the server would refuse stays here with the error', async () => {
    const client = setup();
    await userEvent.type(screen.getByLabelText('Your name'), '!!');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('letters');
    expect(screen.queryByRole('heading', { name: 'Game settings' })).toBeNull();
    expect(client.calls).toEqual([]);
  });

  it('an empty name or a mention keyword is refused too', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('letters');
    await userEvent.type(screen.getByLabelText('Your name'), 'anyone');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(screen.queryByRole('heading', { name: 'Game settings' })).toBeNull();
  });

  it('a server error on Create game shows under the button and keeps the page', async () => {
    const client = new FakeGameClient();
    client.createResult = appError('invalid-name');
    setup(client);
    await userEvent.type(screen.getByLabelText('Your name'), 'Stephen');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('letters');
    expect(screen.getByRole('button', { name: 'Create game' })).toBeEnabled();
  });
});
