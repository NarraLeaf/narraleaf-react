import React, {ErrorInfo, ReactNode} from "react";
import ErrorFallback from "@player/lib/ErrorFallback";

interface ErrorBoundaryProps {
    children: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    static getDerivedStateFromError(error: Error) {
        return {hasError: true, error, errorInfo: null};
    }

    state = {hasError: false, error: null, errorInfo: null};

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({error, errorInfo});
        this.props.onError?.(error, errorInfo);
        console.error(error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error!} errorInfo={this.state.errorInfo!}/>;
        }

        return this.props.children;
    }
}