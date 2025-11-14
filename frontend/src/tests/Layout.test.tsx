import { render } from './testUtils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';

jest.mock('../components/Sidebar', () => () => <div data-testid="sidebar" />);
jest.mock('../components/Navbar', () => () => <div data-testid="navbar" />);

describe('App layout', () => {
  it('does not constrain nested routes to a max width', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            element={<Layout />}
          >
            <Route index element={<div data-testid="content">Main content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('.max-w-7xl')).toBeNull();
  });
});
