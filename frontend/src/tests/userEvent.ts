import { fireEvent } from './testUtils';

type UserClick = (element: Element) => Promise<void>;

type UserEventAPI = {
  click: UserClick;
};

const click: UserClick = async element => {
  fireEvent.click(element);
};

const setup = (): UserEventAPI => ({
  click,
});

const userEvent = {
  setup,
};

export default userEvent;