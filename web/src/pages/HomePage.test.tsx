import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { ClientProvider } from '../game/ClientContext';
import { appError, FakeGameClient } from '../game/fakeGameClient';
import { HomePage } from './HomePage';

function Landing() {
  return <div>at {useParams().code}</div>;
}

function setup(client = new FakeGameClient()) {
  render(
    <ClientProvider value={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/g/:code" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    </ClientProvider>,
  );
  return client;
}

describe('HomePage', () => {
  it('hosts a game and navigates to its code', async () => {
    const client = setup();
    await userEvent.type(screen.getByLabelText('Your name'), 'Stephen');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    await waitFor(() => expect(screen.getByText('at ABCDE')).toBeInTheDocument());
    expect(client.calls[0]).toEqual(['createGame', 'Stephen']);
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

  it('shows an inline error when hosting fails', async () => {
    const client = new FakeGameClient();
    client.createResult = appError('invalid-name');
    setup(client);
    await userEvent.type(screen.getByLabelText('Your name'), '!!');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('letters');
  });
});
