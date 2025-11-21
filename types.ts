export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  attachment?: string; // Base64 string for images
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

export interface ChatState {
  isLoading: boolean;
  error: string | null;
}