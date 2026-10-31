import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { ClientProvider } from '../game/ClientContext';
import { appError, FakeGameClient } from '../game/fakeGameClient';
import { GameSettingsPage } from './GameSettingsPage';
import { clearHostDraft, hostDraft, isValidHostName, tasksPerBoardFor, updateHostDraft } from './hostDraft';
import { HomePage } from './HomePage';

function Landing() {
  return <div>at {useParams().code}</div>;
}

/** Renders the app's routes starting at Home (so Back has somewhere to go), or straight at `/host`. */
function setup({ client = new FakeGameClient(), direct = false }: { client?: FakeGameClient; direct?: boolean } = {}) {
  render(
    <ClientProvider value={client}>
      <MemoryRouter initialEntries={direct ? [{ pathname: '/host', state: { name: 'Stephen' } }] : ['/']}>
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

async function toSettings(name = 'Stephen') {
  await userEvent.type(screen.getByLabelText('Your name'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
  await screen.findByRole('heading', { name: 'Game settings' });
}

afterEach(() => clearHostDraft());

describe('GameSettingsPage', () => {
  it('shows the header, both cards with their helper lines, the derived tasks per board and the hosting line', async () => {
    setup();
    await toSettings();
    expect(screen.getByText('Host', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('ghost');
    expect(screen.getByLabelText('Game name')).toHaveAttribute('maxLength', '40');
    expect(screen.getByText('Shown in the lobby and on the join page. Optional.')).toBeInTheDocument();
    expect(screen.getByText('The centre square starts marked. Boards need 24 tasks instead of 25.')).toBeInTheDocument();
    const sw = screen.getByRole('switch', { name: 'Free space' });
    expect(sw).not.toBeChecked();
    expect(screen.getByTestId('tasks-per-board')).toHaveTextContent('25');
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    expect(screen.getByTestId('tasks-per-board')).toHaveTextContent('24');
    expect(screen.getByRole('button', { name: 'Create game' })).toHaveClass('primary', 'large', 'fullWidth');
    expect(screen.getByText('Hosting as Stephen · settings lock once the game is created')).toBeInTheDocument();
  });

  it('Create game sends the trimmed game name and free space, then lands on the game', async () => {
    const client = setup();
    await toSettings();
    await userEvent.type(screen.getByLabelText('Game name'), "  Halloween at Stephen's ");
    await userEvent.click(screen.getByRole('switch', { name: 'Free space' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(screen.getByText('at ABCDE')).toBeInTheDocument());
    expect(client.calls).toEqual([['createGame', 'Stephen', { gameName: "Halloween at Stephen's", freeSpace: true }]]);
    expect(hostDraft()).toEqual({ name: '', gameName: '', freeSpace: false });
  });

  it('a blank game name is not sent', async () => {
    const client = setup();
    await toSettings();
    await userEvent.type(screen.getByLabelText('Game name'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(client.calls).toEqual([['createGame', 'Stephen', { freeSpace: false }]]));
  });

  it('disables Create game while in flight and shows a server error under it', async () => {
    const client = new FakeGameClient();
    let reject!: (e: Error) => void;
    client.createGame = (name, options) => {
      client.calls.push(['createGame', name, options]);
      return new Promise((_, r) => { reject = r; });
    };
    setup({ client });
    await toSettings();
    const create = screen.getByRole('button', { name: 'Create game' });
    await userEvent.click(create);
    expect(create).toBeDisabled();
    reject(appError('invalid-argument'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(create).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Game settings' })).toBeInTheDocument();
  });

  it('Back returns to Home with the name preserved, and the settings survive coming back', async () => {
    setup();
    await toSettings();
    await userEvent.type(screen.getByLabelText('Game name'), 'Party');
    await userEvent.click(screen.getByRole('switch', { name: 'Free space' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Your name')).toHaveValue('Stephen');
    await userEvent.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(await screen.findByLabelText('Game name')).toHaveValue('Party');
    expect(screen.getByRole('switch', { name: 'Free space' })).toBeChecked();
  });

  it('opened directly with a name in router state, Back goes Home', async () => {
    setup({ direct: true });
    expect(screen.getByText('Hosting as Stephen · settings lock once the game is created')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Host a game' })).toBeInTheDocument();
  });

  it('with no name at all it goes back to Home', async () => {
    render(
      <ClientProvider value={new FakeGameClient()}>
        <MemoryRouter initialEntries={['/host']}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/host" element={<GameSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </ClientProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Host a game' })).toBeInTheDocument();
  });
});

describe('hostDraft', () => {
  it('tasks per board is 24 with free space, else 25', () => {
    expect(tasksPerBoardFor(true)).toBe(24);
    expect(tasksPerBoardFor(false)).toBe(25);
  });

  it('isValidHostName mirrors the server rule', () => {
    expect(isValidHostName('Stephen')).toBe(true);
    expect(isValidHostName("  Mary   Jane-O'Neil ")).toBe(true);
    expect(isValidHostName('')).toBe(false);
    expect(isValidHostName('   ')).toBe(false);
    expect(isValidHostName('!!')).toBe(false);
    expect(isValidHostName('a'.repeat(21))).toBe(false);
    expect(isValidHostName('Someone')).toBe(false);
  });

  it('merges updates and clears', () => {
    updateHostDraft({ name: 'A' });
    updateHostDraft({ freeSpace: true });
    expect(hostDraft()).toEqual({ name: 'A', gameName: '', freeSpace: true });
    clearHostDraft();
    expect(hostDraft().name).toBe('');
  });
});
