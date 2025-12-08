# Supabase Authentication Strategy

## Sign Up Flow

1. **User Registration** (from registration screen)
   ```javascript
   // Step 1: Create auth user
   const { data, error } = await supabase.auth.signUp({
     email: email,
     password: password, // Generated or user-provided
     phone: phoneNumber,
   });

   // Step 2: Create profile
   if (data.user) {
     const { error: profileError } = await supabase
       .from('profiles')
       .insert({
         id: data.user.id,
         username: username.toLowerCase(),
         display_name: displayName,
         phone_number: phoneNumber
       });
   }
   ```

2. **Email Verification** (optional but recommended)
   - Supabase sends verification email automatically
   - Can customize email templates in Supabase dashboard

## Sign In Flow

```javascript
// Email/Password login
const { data, error } = await supabase.auth.signInWithPassword({
  email: email,
  password: password
});

// Get profile data
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', data.user.id)
  .single();
```

## Password Reset Flow

```javascript
// Request reset
const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'alamode://reset-password', // Deep link back to app
});

// Update password (after user clicks link)
const { data, error } = await supabase.auth.updateUser({
  password: newPassword
});
```

## Session Management

```javascript
// Check current session on app launch
const { data: { session } } = await supabase.auth.getSession();

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    // Navigate to home
  } else if (event === 'SIGNED_OUT') {
    // Navigate to login
  }
});

// Sign out
await supabase.auth.signOut();
```

## Protected Routes

```javascript
// In your navigation
const ProtectedRoute = ({ children }) => {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);
  
  if (!user) {
    return <Redirect to="/login" />;
  }
  
  return children;
};
```

## Social Login (Future Enhancement)

```javascript
// Sign in with Apple (great for iOS)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'apple',
  options: {
    redirectTo: 'alamode://auth-callback'
  }
});

// Sign in with Google
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
});
```

## Security Considerations

1. **Username Uniqueness**: Enforce at database level with UNIQUE constraint
2. **Profile Creation**: Use database trigger or Edge Function to ensure profile is always created
3. **Rate Limiting**: Enable in Supabase dashboard to prevent abuse
4. **RLS Policies**: Ensure users can only modify their own data

## Environment Setup

```javascript
// .env file
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Initial Setup in App

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```
