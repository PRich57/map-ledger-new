import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Plus, Users as UsersIcon } from 'lucide-react';
import UserList from '../components/users/UserList';
import UserForm from '../components/users/UserForm';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { useUserStore } from '../store/userStore';
import { User } from '../types';

export default function Users() {
  const { user: currentUser } = useAuthStore();
  const { users, addUser, updateUser, deleteUser } = useUserStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  
  if (currentUser?.role !== 'super') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Access Denied</h3>
          <p className="mt-1 text-sm text-gray-500">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const handleUserSubmit = (userData: Omit<User, 'id'>) => {
    if (editingUser) {
      updateUser(editingUser.id, userData);
    } else {
      addUser(userData);
    }
    setIsFormOpen(false);
    setEditingUser(undefined);
  };

  const handleUserEdit = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user access and permissions for MapLedger
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </button>
        )}
      </div>

      {isFormOpen ? (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-gray-900">
              {editingUser ? 'Edit User' : 'Add New User'}
            </h2>
          </CardHeader>
          <CardContent>
            <UserForm
              initialData={editingUser}
              onSubmit={handleUserSubmit}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingUser(undefined);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <UserList
          users={users}
          currentUserId={currentUser.id}
          onEdit={handleUserEdit}
          onDelete={deleteUser}
        />
      )}
    </div>
  );
}